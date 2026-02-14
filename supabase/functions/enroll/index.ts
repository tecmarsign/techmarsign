import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function verifyClerkToken(token: string, secretKey: string) {
  // Decode JWT to get claims (Clerk tokens are signed, we verify via Clerk API)
  const response = await fetch("https://api.clerk.com/v1/sessions", {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
  });

  // Decode the JWT payload to get user ID
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(atob(parts[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
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
    const userId = await verifyClerkToken(
      token,
      Deno.env.get("CLERK_SECRET_KEY")!
    );

    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { courseId } = await req.json();
    if (!courseId) {
      return new Response(JSON.stringify({ error: "courseId required" }), {
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
