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
import { isEmailVerifiedOrTrustedProvider } from "../components/auth/authProviders";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  // True if Firebase reports the email as verified, OR the user signed in
  // via a trusted OAuth provider (Google, Facebook). Renamed from the older
  // `isEmailVerified` to make the "OR trusted-provider" arm explicit at the
  // callsite - consumers should be loud about which question they're asking.
  isEmailVerifiedOrTrusted: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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
      isEmailVerifiedOrTrusted: user
        ? isEmailVerifiedOrTrustedProvider(user)
        : false,
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
