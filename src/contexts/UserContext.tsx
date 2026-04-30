import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useAuth } from "./AuthContext";
import { migrateDocument } from "../migrations";
import { CURRENT_USER_PROFILE_VERSION } from "../migrations/userProfile";
import { logError } from "../utils/logError";
import type { ProfileLoadState, UserProfile } from "../types/profile";

export interface UserContextValue {
  loadState: ProfileLoadState;
  // Partial-update helper. Caller passes only the fields to change; the
  // current version is stamped on write. If no profile doc exists yet the
  // helper falls back to setDoc with merge.
  updateProfile: (partial: Partial<UserProfile>) => Promise<void>;
  // Tracked-metric reorder/edit helper used by TrackedDataSetup. Writes a
  // single field to the existing profile doc; throws if no profile exists
  // (caller is expected to gate on loadState).
  setTrackedMetrics: (
    type: "wellness" | "performance",
    ids: string[],
  ) => Promise<void>;
  // Re-subscribe to the profile snapshot. Used by the retry UI rendered
  // when loadState.status === 'error'.
  retry: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loadState, setLoadState] = useState<ProfileLoadState>({
    status: "loading",
  });
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!user) {
      setLoadState({ status: "loading" });
      return;
    }

    setLoadState({ status: "loading" });
    const ref = doc(db, "users", user.uid, "profile", "main");
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setLoadState({ status: "missing" });
          return;
        }
        try {
          const migrated = migrateDocument(
            "userProfile",
            snap.data() as Record<string, unknown>,
          ) as unknown as UserProfile;
          setLoadState({ status: "loaded", profile: migrated });
        } catch (err) {
          logError(err, {
            docPath: ref.path,
            fromVersion:
              typeof snap.data()?.version === "number"
                ? (snap.data()?.version as number)
                : 1,
          });
          // Migration failure on an existing doc -> 'missing' per the
          // pinned migration contract ("loud in logs, soft in UI -
          // a single bad doc must not lock the user out"). Snapshot
          // *subscription* failures take the error branch below instead.
          setLoadState({ status: "missing" });
        }
      },
      (err) => {
        logError(err, { stage: "userContext.onSnapshot", uid: user.uid });
        // Don't collapse to 'missing' - a transient Firestore error on a
        // user with a real profile would otherwise drop them into the
        // onboarding form, which setDoc(merge:true)s over their data.
        setLoadState({ status: "error", error: err });
      },
    );
    return unsubscribe;
  }, [user, retryNonce]);

  const retry = useCallback(() => {
    setRetryNonce((n) => n + 1);
  }, []);

  const value = useMemo<UserContextValue>(() => {
    return {
      loadState,
      retry,
      async updateProfile(partial: Partial<UserProfile>) {
        if (!user) throw new Error("updateProfile called without auth user");
        const ref = doc(db, "users", user.uid, "profile", "main");
        const next = {
          ...partial,
          version: CURRENT_USER_PROFILE_VERSION,
        };
        // setDoc with merge handles both first-time creation (no existing doc)
        // and subsequent partial edits.
        await setDoc(ref, next, { merge: true });
      },
      async setTrackedMetrics(
        type: "wellness" | "performance",
        ids: string[],
      ) {
        if (!user)
          throw new Error("setTrackedMetrics called without auth user");
        const ref = doc(db, "users", user.uid, "profile", "main");
        const field =
          type === "wellness"
            ? "trackedWellnessMetrics"
            : "trackedPerformanceMetrics";
        await updateDoc(ref, { [field]: ids });
      },
    };
  }, [loadState, retry, user]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}

// Convenience for consumers (HamburgerMenu, ProfileForm) that want the
// loaded profile without re-deriving the discriminated union check. Returns
// null when not loaded.
export function useUserProfile(): UserProfile | null {
  const { loadState } = useUser();
  return loadState.status === "loaded" ? loadState.profile : null;
}

// Re-exported for symmetry with useUser().updateProfile - lets callers
// dual-write to Firebase Auth without re-importing auth.
export { auth };
