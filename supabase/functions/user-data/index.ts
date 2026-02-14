import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getUserIdFromToken(authHeader: string): string | null {
  const token = authHeader.replace("Bearer ", "");
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

    const userId = getUserIdFromToken(authHeader);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
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
        const courseIds = url.searchParams.get("courseIds")?.split(",") || [];
        if (courseIds.length > 0) {
          const { data: tutorData } = await supabase
            .from("tutor_courses")
            .select(`
              tutor_id,
              profile:profiles!tutor_courses_tutor_id_fkey(full_name, email, avatar_url)
            `)
            .in("course_id", courseIds);
          data = tutorData;
        } else {
          data = [];
        }
        break;
      }

      case "lessons": {
        const courseId = url.searchParams.get("courseId");
        const phase = url.searchParams.get("phase");
        let query = supabase.from("lessons").select("*");
        if (courseId) query = query.eq("course_id", courseId);
        if (phase) query = query.eq("phase_number", parseInt(phase));
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
