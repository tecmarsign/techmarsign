import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Users, CheckCircle2, ArrowRight } from "lucide-react";
import { EnrollmentButton } from "./EnrollmentButton";
import { Link } from "react-router-dom";
import type { CourseWithPhases } from "@/hooks/useCourses";

interface CourseCardProps {
  course: CourseWithPhases;
  variant?: "full" | "compact";
}

export function CourseCard({ course, variant = "full" }: CourseCardProps) {
  const phaseCount = course.course_phases?.length || 0;
  const isAI = course.category?.toLowerCase() === "ai" || course.title.toLowerCase().includes("ai");

  if (variant === "compact") {
    return (
      <Card className="border-border/50 hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-display text-lg font-bold text-foreground">
                {course.title}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-muted-foreground">{course.category}</p>
                {isAI && (
                  <Badge variant="secondary" className="bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 text-white border-0 text-[10px] px-1.5 py-0 h-5">
                    Powered by Google Gemini
                  </Badge>
                )}
              </div>
            </div>
            {course.price && (
              <Badge variant="secondary">
                KSH {course.price.toLocaleString()}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground line-clamp-2">
            {course.description}
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {course.duration && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {course.duration}
              </div>
            )}
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {phaseCount} phases
            </div>
          </div>
          <EnrollmentButton courseId={course.id} courseTitle={course.title} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      {/* Course Overview */}
      <div className="lg:col-span-2 space-y-8">
        <div>
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 rounded-2xl bg-primary/10 text-primary">
              <Users className="h-8 w-8" />
            </div>
            <div>
              <h2 className="font-display text-3xl font-bold text-foreground mb-2">
                {course.title}
              </h2>
              <div className="flex items-center gap-3">
                <p className="text-muted-foreground">{course.category}</p>
                {isAI && (
                  <Badge variant="secondary" className="bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 text-white border-0">
                    Linked to Google LLMs
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {course.description}
          </p>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-6">
          {course.duration && (
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{course.duration}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">{phaseCount} phases</span>
          </div>
          {course.price && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-base">
                KSH {course.price.toLocaleString()}
              </Badge>
            </div>
          )}
        </div>

        {/* Phases */}
        {course.course_phases && course.course_phases.length > 0 && (
          <div>
            <h3 className="font-display text-xl font-bold text-foreground mb-6">
              Course Phases
            </h3>
            <div className="space-y-4">
              {course.course_phases.map((phase) => (
                <Card key={phase.id} className="border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-primary text-primary-foreground">
                          {phase.phase_number}
                        </span>
                        <h4 className="font-semibold text-foreground">
                          {phase.title}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        {phase.duration && (
                          <Badge variant="outline">{phase.duration}</Badge>
                        )}
                        {phase.price && (
                          <Badge variant="secondary">KSH {phase.price.toLocaleString()}</Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  {phase.description && (
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {phase.description}
                      </p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {isAI && (
          <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <svg className="w-16 h-16 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 7.5l-10-5v3.5l10 5 10-5v-3.5l-10 5z" /></svg>
            </div>
            <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
              <span className="text-lg">🎁</span> Google AI Special Offer
            </h4>
            <p className="text-sm text-blue-800 leading-relaxed">
              Pay the full amount at <strong>KSH 42,000</strong> to get <strong className="text-blue-700">two months FREE Google AI subscription</strong>! Build alongside world-class models.
            </p>
          </div>
        )}
        <Card className="border-border/50 shadow-card sticky top-24">
          <CardHeader>
            <h3 className="font-display text-xl font-bold text-foreground">
              Ready to Enroll?
            </h3>
            <p className="text-muted-foreground text-sm">
              Start your journey in {course.title}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="font-semibold text-foreground mb-3">
                What You'll Learn
              </h4>
              <ul className="space-y-2">
                {course.course_phases?.slice(0, 4).map((phase) => (
                  <li
                    key={phase.id}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <CheckCircle2 className="h-4 w-4 text-secondary shrink-0 mt-0.5" />
                    {phase.title}
                  </li>
                ))}
              </ul>
            </div>

            <EnrollmentButton courseId={course.id} courseTitle={course.title} />

            <Button variant="outline" className="w-full" asChild>
              <Link to="/contact">Request Info</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
