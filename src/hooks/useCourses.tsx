import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Course = Tables<"courses">;
type CoursePhase = Tables<"course_phases">;
type Enrollment = Tables<"enrollments">;

export interface CourseWithPhases extends Course {
  course_phases: CoursePhase[];
}

export interface EnrollmentWithCourse extends Enrollment {
  courses: Course | null;
}

export function useCourses() {
  const [courses, setCourses] = useState<CourseWithPhases[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentWithCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchCourses = async () => {
    try {
      const { data, error } = await supabase
        .from("courses")
        .select(`
          *,
          course_phases (*)
        `)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Sort phases by phase_number
      const coursesWithSortedPhases = (data || []).map(course => ({
        ...course,
        course_phases: (course.course_phases || []).sort((a, b) => a.phase_number - b.phase_number)
      }));
      
      setCourses(coursesWithSortedPhases);
    } catch (error: any) {
      console.error("Error fetching courses:", error);
      toast.error("Failed to load courses");
    }
  };

  const fetchEnrollments = async () => {
    if (!user) {
      setEnrollments([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`
          *,
          courses (*)
        `)
        .eq("student_id", user.id);

      if (error) throw error;
      setEnrollments(data || []);
    } catch (error: any) {
      console.error("Error fetching enrollments:", error);
    }
  };

  const enrollInCourse = async (courseId: string) => {
    if (!user) {
      toast.error("Please log in to enroll in a course");
      return { success: false };
    }

    // Check if already enrolled
    const existingEnrollment = enrollments.find(e => e.course_id === courseId);
    if (existingEnrollment) {
      toast.error("You are already enrolled in this course");
      return { success: false };
    }

    try {
      const { error } = await supabase
        .from("enrollments")
        .insert({
          course_id: courseId,
          student_id: user.id,
          status: "active",
          current_phase: 1,
          progress: 0,
        });

      if (error) throw error;

      toast.success("Successfully enrolled in course!");
      await fetchEnrollments();
      return { success: true };
    } catch (error: any) {
      console.error("Error enrolling:", error);
      toast.error("Failed to enroll in course");
      return { success: false };
    }
  };

  const isEnrolled = (courseId: string) => {
    return enrollments.some(e => e.course_id === courseId);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchCourses(), fetchEnrollments()]);
      setLoading(false);
    };
    loadData();
  }, [user]);

  return {
    courses,
    enrollments,
    loading,
    enrollInCourse,
    isEnrolled,
    refetch: () => Promise.all([fetchCourses(), fetchEnrollments()]),
  };
}
