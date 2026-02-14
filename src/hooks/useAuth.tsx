import { createContext, useContext, ReactNode } from "react";
import { useUser, useClerk } from "@clerk/clerk-react";

type AppRole = "admin" | "student" | "tutor";

interface AuthContextType {
  user: { id: string; email: string; fullName: string } | null;
  session: unknown;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user: clerkUser, isLoaded, isSignedIn } = useUser();
  const { signOut: clerkSignOut } = useClerk();

  const user = isSignedIn && clerkUser
    ? {
        id: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress || "",
        fullName: clerkUser.fullName || clerkUser.firstName || "",
      }
    : null;

  // For now, default role to "student". 
  // Admin/tutor roles can be managed via Clerk metadata.
  const role: AppRole | null = isSignedIn
    ? ((clerkUser?.publicMetadata?.role as AppRole) || "student")
    : null;

  const signOut = async () => {
    await clerkSignOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session: isSignedIn ? {} : null,
        role,
        loading: !isLoaded,
        signOut,
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
