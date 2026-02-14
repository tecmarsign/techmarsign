import { createContext, useContext, ReactNode, useState, useEffect, useCallback } from "react";
import { useUser, useClerk, useSession } from "@clerk/clerk-react";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "student" | "tutor";

interface AuthContextType {
  user: { id: string; email: string; fullName: string } | null;
  session: unknown;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user: clerkUser, isLoaded, isSignedIn } = useUser();
  const { signOut: clerkSignOut } = useClerk();
  const { session } = useSession();
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  const user = isSignedIn && clerkUser
    ? {
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress || "",
        fullName: clerkUser.fullName || clerkUser.firstName || "",
      }
    : null;

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!session) return null;
    try {
      return await session.getToken() || null;
    } catch {
      return null;
    }
  }, [session]);

  // Fetch role from database via edge function
  useEffect(() => {
    if (!isSignedIn || !session) {
      setRole(null);
      return;
    }

    const fetchRole = async () => {
      setRoleLoading(true);
      try {
        const token = await session.getToken();
        if (!token) {
          // Fallback to Clerk metadata
          setRole((clerkUser?.publicMetadata?.role as AppRole) || "student");
          setRoleLoading(false);
          return;
        }

        const { data } = await supabase.functions.invoke("user-data", {
          headers: { Authorization: `Bearer ${token}` },
          body: null,
          method: "GET",
        });

        // Use query param approach instead
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-data?resource=role`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const result = await response.json();
          setRole(result.data?.role || (clerkUser?.publicMetadata?.role as AppRole) || "student");
        } else {
          setRole((clerkUser?.publicMetadata?.role as AppRole) || "student");
        }
      } catch (error) {
        console.error("Error fetching role:", error);
        setRole((clerkUser?.publicMetadata?.role as AppRole) || "student");
      }
      setRoleLoading(false);
    };

    fetchRole();
  }, [isSignedIn, session, clerkUser]);

  const signOut = async () => {
    await clerkSignOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session: isSignedIn ? {} : null,
        role,
        loading: !isLoaded || roleLoading,
        signOut,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
