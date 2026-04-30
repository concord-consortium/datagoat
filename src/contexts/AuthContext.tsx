import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { auth } from "../firebase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isEmailVerified: boolean;
  daysUnverified: number;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Client-clock-based: drives the advisory VerificationBanner only, not a compliance gate.
function calcDaysUnverified(user: User | null): number {
  if (!user) return 0;
  const created = user.metadata?.creationTime
    ? new Date(user.metadata.creationTime).getTime()
    : Date.now();
  return Math.floor((Date.now() - created) / MS_PER_DAY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isEmailVerified: user?.emailVerified ?? false,
      daysUnverified: calcDaysUnverified(user),
      signOut: () => firebaseSignOut(auth),
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
