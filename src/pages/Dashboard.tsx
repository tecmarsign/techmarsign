import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import StudentDashboard from "@/components/dashboard/StudentDashboard";
import TutorDashboard from "@/components/dashboard/TutorDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";

export default function Dashboard() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  switch (role) {
    case "admin":
      return <AdminDashboard />;
    case "tutor":
      return <TutorDashboard />;
    case "student":
    default:
      return <StudentDashboard />;
  }
}
