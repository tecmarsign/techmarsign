import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Cache JWKS keys to avoid fetching on every request
let cachedJwks: any = null;
let jwksCacheTime = 0;
const JWKS_CACHE_TTL = 3600000; // 1 hour

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

    // Check algorithm
    if (header.alg !== "RS256") return null;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    // Check not-before
    if (payload.nbf && payload.nbf > now + 60) return null;

    // Verify issuer exists
    const issuer = payload.iss;
    if (!issuer) return null;

    // Fetch JWKS and find matching key
    const jwks = await fetchJwks(issuer);
    const key = jwks.keys?.find((k: any) => k.kid === header.kid && k.kty === "RSA");
    if (!key) return null;

    // Import public key for verification
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      { kty: key.kty, n: key.n, e: key.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Verify signature
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

// Validate UUID format
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

    const url = new URL(req.url);
    const resource = url.searchParams.get("resource");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let data: any = null;

    switch (resource) {
      case "profile": {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email, avatar_url")
          .eq("user_id", userId)
          .maybeSingle();
        data = profile;
        break;
      }

      case "enrollments": {
        const { data: enrollments } = await supabase
          .from("enrollments")
          .select(`
            id, current_phase, status, progress,
            course:courses(id, title, category, image_url)
          `)
          .eq("student_id", userId);
        data = enrollments;
        break;
      }

      case "enrollments-with-courses": {
        const { data: enrollments } = await supabase
          .from("enrollments")
          .select(`*, courses(*)`)
          .eq("student_id", userId);
        data = enrollments;
        break;
      }

      case "tutors": {
        const courseIdsParam = url.searchParams.get("courseIds") || "";
        const courseIds = courseIdsParam.split(",").filter(id => id && isValidUUID(id));
        if (courseIds.length > 0) {
          const { data: tutorData } = await supabase
            .from("tutor_courses")
            .select(`
              tutor_id,
              course_id
            `)
            .in("course_id", courseIds);

          if (tutorData && tutorData.length > 0) {
            const tutorIds = [...new Set(tutorData.map(t => t.tutor_id))];
            const { data: profilesData } = await supabase
              .from("profiles")
              .select("user_id, full_name, email, avatar_url")
              .in("user_id", tutorIds);

            data = tutorData.map(t => ({
              tutor_id: t.tutor_id,
              profile: profilesData?.find(p => p.user_id === t.tutor_id) || null,
            }));
          } else {
            data = [];
          }
        } else {
          data = [];
        }
        break;
      }

      case "lessons": {
        const courseId = url.searchParams.get("courseId");
        const phase = url.searchParams.get("phase");
        if (courseId && !isValidUUID(courseId)) {
          return new Response(JSON.stringify({ error: "Invalid courseId" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        let query = supabase.from("lessons").select("*");
        if (courseId) query = query.eq("course_id", courseId);
        if (phase) {
          const phaseNum = parseInt(phase, 10);
          if (isNaN(phaseNum) || phaseNum < 1) {
            return new Response(JSON.stringify({ error: "Invalid phase" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          query = query.eq("phase_number", phaseNum);
        }
        const { data: lessons } = await query.order("order_index");
        data = lessons;
        break;
      }

      case "lesson-progress": {
        const { data: progress } = await supabase
          .from("lesson_progress")
          .select("*")
          .eq("student_id", userId);
        data = progress;
        break;
      }

      case "assignments": {
        const courseId = url.searchParams.get("courseId");
        if (courseId && !isValidUUID(courseId)) {
          return new Response(JSON.stringify({ error: "Invalid courseId" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        let query = supabase.from("assignments").select("*");
        if (courseId) query = query.eq("course_id", courseId);
        const { data: assignments } = await query;
        data = assignments;
        break;
      }

      case "submissions": {
        const { data: submissions } = await supabase
          .from("assignment_submissions")
          .select("*")
          .eq("student_id", userId);
        data = submissions;
        break;
      }

      case "role": {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle();
        data = roleData;
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: "Unknown resource" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
    }

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("User data error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
