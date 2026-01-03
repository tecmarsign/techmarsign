import { PageLayout } from "@/components/layout/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Monitor,
  Building2,
  BookOpen,
  Loader2,
} from "lucide-react";
import { useCourses } from "@/hooks/useCourses";
import { CourseCard } from "@/components/courses/CourseCard";

export default function Courses() {
  const { courses, loading } = useCourses();

  return (
    <PageLayout>
      {/* Hero Section */}
      <section className="py-16 lg:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <Badge variant="secondary" className="mb-4">
              Our Programs
            </Badge>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6">
              Transform Your Career with{" "}
              <span className="text-secondary">Industry-Ready</span> Skills
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Choose from our comprehensive courses in Technology, Marketing, and Design. 
              Each program is designed to take you from beginner to job-ready professional.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild>
                <a href="#courses">
                  Explore Courses
                  <ArrowRight className="h-5 w-5" />
                </a>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link to="/contact">Get Guidance</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Learning Modes */}
      <section className="py-12 border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-center gap-8 md:gap-16">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-secondary/10 text-secondary">
                <Monitor className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Online Learning</h3>
                <p className="text-sm text-muted-foreground">Learn from anywhere, anytime</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-accent/10 text-accent">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">In-Person Classes</h3>
                <p className="text-sm text-muted-foreground">Hands-on experience at our campus</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Courses Detail */}
      <section id="courses" className="py-20 lg:py-28">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-20">
              <BookOpen className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                No Courses Available
              </h3>
              <p className="text-muted-foreground">
                Check back soon for new courses!
              </p>
            </div>
          ) : (
            <Tabs defaultValue={courses[0]?.id} className="space-y-12">
              <TabsList className="flex flex-wrap justify-center gap-2 bg-transparent h-auto p-0">
                {courses.map((course) => (
                  <TabsTrigger
                    key={course.id}
                    value={course.id}
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-6 py-3 rounded-lg"
                  >
                    <BookOpen className="h-5 w-5 mr-2" />
                    {course.title}
                  </TabsTrigger>
                ))}
              </TabsList>

              {courses.map((course) => (
                <TabsContent key={course.id} value={course.id}>
                  <CourseCard course={course} variant="full" />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </section>
    </PageLayout>
  );
}
