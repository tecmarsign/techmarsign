import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { adminApi } from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Layers } from "lucide-react";
import { toast } from "sonner";
import { PhaseManager } from "./PhaseManager";

interface Course {
  id: string;
  title: string;
  description: string | null;
  category: string;
  duration: string | null;
  price: number | null;
  is_active: boolean;
  image_url: string | null;
  phase_count?: number;
}

interface CourseFormData {
  title: string;
  description: string;
  category: string;
  duration: string;
  price: string;
  image_url: string;
  is_active: boolean;
}

const defaultFormData: CourseFormData = {
  title: "",
  description: "",
  category: "",
  duration: "",
  price: "",
  image_url: "",
  is_active: true
};

export function CourseManager() {
  const { getToken } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);
  const [formData, setFormData] = useState<CourseFormData>(defaultFormData);
  const [saving, setSaving] = useState(false);
  const [managingPhasesFor, setManagingPhasesFor] = useState<Course | null>(null);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    const { data: coursesData, error: coursesError } = await adminApi<Course[]>(
      { action: "select", table: "courses", order: { column: "created_at", ascending: false } },
      getToken
    );

    if (coursesError) {
      toast.error("Failed to fetch courses");
      setLoading(false);
      return;
    }

    const { data: phasesData } = await adminApi<{ course_id: string }[]>(
      { action: "select", table: "course_phases", select: "course_id" },
      getToken
    );

    const phaseCounts: Record<string, number> = {};
    phasesData?.forEach(p => {
      phaseCounts[p.course_id] = (phaseCounts[p.course_id] || 0) + 1;
    });

    const coursesWithPhases = (coursesData || []).map(course => ({
      ...course,
      phase_count: phaseCounts[course.id] || 0
    }));

    setCourses(coursesWithPhases);
    setLoading(false);
  };

  const handleOpenCreate = () => {
    setEditingCourse(null);
    setFormData(defaultFormData);
    setDialogOpen(true);
  };

  const handleOpenEdit = (course: Course) => {
    setEditingCourse(course);
    setFormData({
      title: course.title,
      description: course.description || "",
      category: course.category,
      duration: course.duration || "",
      price: course.price?.toString() || "",
      image_url: course.image_url || "",
      is_active: course.is_active
    });
    setDialogOpen(true);
  };

  const handleOpenDelete = (course: Course) => {
    setDeletingCourse(course);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    const trimmedTitle = formData.title.trim();
    const trimmedCategory = formData.category.trim();
    const trimmedDescription = formData.description.trim();
    const trimmedDuration = formData.duration.trim();
    const trimmedImageUrl = formData.image_url.trim();

    if (!trimmedTitle || !trimmedCategory) {
      toast.error("Title and category are required");
      return;
    }
    if (trimmedTitle.length > 200) {
      toast.error("Title is too long (max 200 characters)");
      return;
    }
    if (trimmedCategory.length > 100) {
      toast.error("Category is too long (max 100 characters)");
      return;
    }
    if (trimmedDescription && trimmedDescription.length > 10000) {
      toast.error("Description is too long (max 10,000 characters)");
      return;
    }
    if (trimmedImageUrl && !/^https:\/\/.+/.test(trimmedImageUrl)) {
      toast.error("Image URL must start with https://");
      return;
    }

    setSaving(true);

    const courseData = {
      title: trimmedTitle,
      description: trimmedDescription || null,
      category: trimmedCategory,
      duration: trimmedDuration || null,
      price: formData.price ? parseFloat(formData.price) : null,
      image_url: trimmedImageUrl || null,
      is_active: formData.is_active
    };

    if (editingCourse) {
      const { error } = await adminApi(
        { action: "update", table: "courses", data: courseData, filters: [{ column: "id", op: "eq", value: editingCourse.id }] },
        getToken
      );
      if (error) {
        toast.error("Failed to update course");
      } else {
        toast.success("Course updated successfully");
        setDialogOpen(false);
        fetchCourses();
      }
    } else {
      const { error } = await adminApi(
        { action: "insert", table: "courses", data: courseData },
        getToken
      );
      if (error) {
        toast.error("Failed to create course");
      } else {
        toast.success("Course created successfully");
        setDialogOpen(false);
        fetchCourses();
      }
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deletingCourse) return;

    const { error } = await adminApi(
      { action: "delete", table: "courses", filters: [{ column: "id", op: "eq", value: deletingCourse.id }] },
      getToken
    );

    if (error) {
      toast.error("Failed to delete course. It may have associated data.");
    } else {
      toast.success("Course deleted successfully");
      setDeleteDialogOpen(false);
      fetchCourses();
    }
  };

  const handleToggleActive = async (course: Course) => {
    const { error } = await adminApi(
      { action: "update", table: "courses", data: { is_active: !course.is_active }, filters: [{ column: "id", op: "eq", value: course.id }] },
      getToken
    );

    if (error) {
      toast.error("Failed to update course status");
    } else {
      setCourses(courses.map(c =>
        c.id === course.id ? { ...c, is_active: !c.is_active } : c
      ));
    }
  };

  if (managingPhasesFor) {
    return (
      <Card>
        <CardContent className="pt-6">
          <PhaseManager
            courseId={managingPhasesFor.id}
            courseTitle={managingPhasesFor.title}
            onBack={() => {
              setManagingPhasesFor(null);
              fetchCourses();
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Course Management</CardTitle>
          <CardDescription>Create, edit, and manage courses with phases</CardDescription>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Course
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading courses...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Phases</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell className="font-medium">{course.title}</TableCell>
                  <TableCell>{course.category}</TableCell>
                  <TableCell>{course.duration || "-"}</TableCell>
                  <TableCell>{course.price ? `$${course.price}` : "Free"}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1"
                      onClick={() => setManagingPhasesFor(course)}
                    >
                      <Layers className="h-4 w-4" />
                      {course.phase_count || 0} phases
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={course.is_active ? "default" : "secondary"}
                      className="cursor-pointer"
                      onClick={() => handleToggleActive(course)}
                    >
                      {course.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(course)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDelete(course)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingCourse ? "Edit Course" : "Create Course"}</DialogTitle>
              <DialogDescription>
                {editingCourse ? "Update course details" : "Add a new course to the platform"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Course title" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category *</Label>
                <Input id="category" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} placeholder="e.g., Development, Design" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Course description" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="duration">Duration</Label>
                  <Input id="duration" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: e.target.value })} placeholder="e.g., 8 weeks" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="price">Price ($)</Label>
                  <Input id="price" type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="image_url">Image URL</Label>
                <Input id="image_url" value={formData.image_url} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Active</Label>
                <Switch id="is_active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingCourse ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Course</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{deletingCourse?.title}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
