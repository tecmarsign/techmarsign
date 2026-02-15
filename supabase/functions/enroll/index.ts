import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Cache JWKS keys
let cachedJwks: any = null;
let jwksCacheTime = 0;
const JWKS_CACHE_TTL = 3600000;

async function fetchJwks(issuer: string): Promise<any> {
  const now = Date.now();
  if (cachedJwks && now - jwksCacheTime < JWKS_CACHE_TTL) {
    return cachedJwks;
  }
  const res = await fetch(`${issuer}/.well-known/jwks.json`);
  if (!res.ok) throw new Error("Failed to fetch JWKS");
  cachedJwks = await res.json();
  jwksCacheTime = now;
  return cachedJwks;
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function verifyClerkJWT(token: string): Promise<string | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const headerJson = new TextDecoder().decode(base64UrlDecode(parts[0]));
    const payloadJson = new TextDecoder().decode(base64UrlDecode(parts[1]));
    const header = JSON.parse(headerJson);
    const payload = JSON.parse(payloadJson);

    if (header.alg !== "RS256") return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    if (payload.nbf && payload.nbf > now + 60) return null;

    const issuer = payload.iss;
    if (!issuer) return null;

    const jwks = await fetchJwks(issuer);
    const key = jwks.keys?.find((k: any) => k.kid === header.kid && k.kty === "RSA");
    if (!key) return null;

    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      { kty: key.kty, n: key.n, e: key.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = base64UrlDecode(parts[2]);
    const dataBytes = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const isValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signatureBytes,
      dataBytes
    );

    if (!isValid) return null;
    return payload.sub || null;
  } catch (err) {
    console.error("JWT verification error:", err);
    return null;
  }
}

function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const userId = await verifyClerkJWT(token);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const courseId = body?.courseId;

    // Validate courseId format
    if (!courseId || typeof courseId !== "string") {
      return new Response(JSON.stringify({ error: "courseId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isValidUUID(courseId)) {
      return new Response(JSON.stringify({ error: "Invalid courseId format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check course exists and is active
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id, price, is_active")
      .eq("id", courseId)
      .eq("is_active", true)
      .maybeSingle();

    if (courseError || !course) {
      return new Response(
        JSON.stringify({ error: "Course not found or not active" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check existing enrollment
    const { data: existing } = await supabase
      .from("enrollments")
      .select("id, status")
      .eq("student_id", userId)
      .eq("course_id", courseId)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({
          error: existing.status === "pending_payment"
            ? "Enrollment pending payment"
            : "Already enrolled",
          pendingPayment: existing.status === "pending_payment",
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Rate limit check
    const { count } = await supabase
      .from("enrollment_attempts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("attempted_at", new Date(Date.now() - 3600000).toISOString());

    if ((count || 0) >= 10) {
      await supabase
        .from("enrollment_attempts")
        .insert({ user_id: userId, course_id: courseId, success: false });

      return new Response(
        JSON.stringify({ error: "Too many attempts. Try again later." }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create enrollment
    const isPaid = course.price && course.price > 0;
    const { data: enrollment, error: enrollError } = await supabase
      .from("enrollments")
      .insert({
        student_id: userId,
        course_id: courseId,
        status: isPaid ? "pending_payment" : "active",
        current_phase: 1,
        progress: 0,
      })
      .select("id")
      .single();

    if (enrollError) throw enrollError;

    // Log successful attempt
    await supabase
      .from("enrollment_attempts")
      .insert({ user_id: userId, course_id: courseId, success: true });

    return new Response(
      JSON.stringify({
        success: true,
        enrollmentId: enrollment.id,
        pendingPayment: isPaid,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Enrollment error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
