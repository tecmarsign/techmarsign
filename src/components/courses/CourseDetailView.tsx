import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Users, CheckCircle2, Calendar, BookOpen } from "lucide-react";
import { EnrollmentButton } from "./EnrollmentButton";
import { Link } from "react-router-dom";
import type { CourseWithPhases } from "@/hooks/useCourses";
import { cn } from "@/lib/utils";

interface CourseDetailViewProps {
  course: CourseWithPhases;
}

function parseWeeklyContent(description: string): { week: number; content: string }[] {
  // Try to parse "Week X: content" patterns from the description
  const weekPattern = /Week\s+(\d+):\s*([^.]+(?:\.[^W])*)/gi;
  const weeks: { week: number; content: string }[] = [];
  let match;

  while ((match = weekPattern.exec(description)) !== null) {
    weeks.push({
      week: parseInt(match[1]),
      content: match[2].trim().replace(/\.$/, ""),
    });
  }

  return weeks;
}

export function CourseDetailView({ course }: CourseDetailViewProps) {
  const phases = course.course_phases || [];
  const [activePhase, setActivePhase] = useState(0);

  const currentPhase = phases[activePhase];

  return (
    <div className="space-y-8">
      {/* Course Header */}
      <div className="text-center max-w-3xl mx-auto">
        <Badge variant="secondary" className="mb-4">
          {course.category}
        </Badge>
        <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
          {course.title}
        </h1>
        <p className="text-lg text-muted-foreground mb-6">
          {course.description}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          {course.duration && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-5 w-5" />
              <span className="font-medium">{course.duration}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <BookOpen className="h-5 w-5" />
            <span className="font-medium">{phases.length} classes</span>
          </div>
          {course.price && (
            <Badge variant="secondary" className="text-base px-4 py-1">
              KSH {course.price.toLocaleString()} (Full Package)
            </Badge>
          )}
        </div>
      </div>

      {/* Phase Sub-Navigation */}
      {phases.length > 0 && (
        <div className="border-b border-border">
          <div className="flex overflow-x-auto gap-1 pb-0 scrollbar-hide">
            {phases.map((phase, index) => (
              <button
                key={phase.id}
                onClick={() => setActivePhase(index)}
                className={cn(
                  "flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  activePhase === index
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                {phase.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active Phase Content */}
      {currentPhase && (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Phase Header */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold bg-primary text-primary-foreground">
                  {currentPhase.phase_number}
                </span>
                <div>
                  <h2 className="font-display text-2xl font-bold text-foreground">
                    {currentPhase.title}
                  </h2>
                  {currentPhase.duration && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {currentPhase.duration}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Weekly Breakdown */}
            {currentPhase.description && (() => {
              const weeks = parseWeeklyContent(currentPhase.description);
              if (weeks.length > 0) {
                return (
                  <div>
                    <h3 className="font-display text-lg font-bold text-foreground mb-4">
                      Week-by-Week Breakdown
                    </h3>
                    <div className="space-y-3">
                      {weeks.map((week) => (
                        <Card key={week.week} className="border-border/50">
                          <CardContent className="p-4 flex items-start gap-4">
                            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-muted flex flex-col items-center justify-center">
                              <span className="text-[10px] uppercase text-muted-foreground font-medium">Week</span>
                              <span className="text-lg font-bold text-foreground leading-none">{week.week}</span>
                            </div>
                            <div className="pt-1">
                              <p className="text-foreground font-medium">{week.content}</p>
                              {week.week <= 6 && (
                                <span className="text-xs text-muted-foreground mt-1 inline-block">Learning</span>
                              )}
                              {week.week === 7 && (
                                <span className="text-xs text-secondary mt-1 inline-block font-medium">Test & Project</span>
                              )}
                              {week.week === 8 && (
                                <span className="text-xs text-secondary mt-1 inline-block font-medium">Final Review</span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              }
              // Fallback: just show the description
              return (
                <p className="text-muted-foreground leading-relaxed">
                  {currentPhase.description}
                </p>
              );
            })()}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="border-border/50 shadow-card sticky top-24">
              <CardHeader>
                <h3 className="font-display text-xl font-bold text-foreground">
                  Ready to Enroll?
                </h3>
                <p className="text-muted-foreground text-sm">
                  Get access to all {phases.length} classes in {course.title}
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {course.price && (
                  <div className="space-y-3">
                    <div className="text-center p-4 rounded-xl bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">Full Package</p>
                      <p className="text-3xl font-bold text-foreground">
                        KSH {course.price.toLocaleString()}
                      </p>
                    </div>
                    {currentPhase?.price && (
                      <div className="text-center p-3 rounded-xl border border-border">
                        <p className="text-sm text-muted-foreground mb-1">Per Class</p>
                        <p className="text-xl font-bold text-foreground">
                          KSH {currentPhase.price.toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <h4 className="font-semibold text-foreground mb-3">
                    All {phases.length} Classes Included
                  </h4>
                  <ul className="space-y-2">
                    {phases.map((phase) => (
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
      )}
    </div>
  );
}
