import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useUser } from "../../contexts/UserContext";
import { Loading } from "../Loading";
import { ProfileLoadError } from "./ProfileLoadError";

// Tri-state ProfileLoadState gate per requirements:
//   loading -> render <Loading />, never redirect (or returning users get
//              kicked to /profile on every cold start)
//   missing -> redirect to /profile (onboarding entry)
//   loaded  -> render the child route
//   error   -> render the retry UI (do NOT redirect to /profile, or a
//              transient Firestore error would drop a real user into
//              onboarding and overwrite their profile on submit)
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const { loadState, retry } = useUser();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (loadState.status === "loading") return <Loading />;
  if (loadState.status === "error") return <ProfileLoadError onRetry={retry} />;
  if (loadState.status === "missing")
    return <Navigate to="/profile" replace />;
  return <Outlet />;
}

// Onboarding routes (/profile, /setup/tracking) only gate on
// loadState.status !== 'loading'. They render whether or not the doc exists,
// because that's where new users land and where existing users edit.
// 'error' still renders the retry UI here - submitting the onboarding form
// against a stale snapshot error would setDoc(merge:true) over the user's
// real profile.
export function OnboardingRoute() {
  const { user, loading } = useAuth();
  const { loadState, retry } = useUser();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (loadState.status === "loading") return <Loading />;
  if (loadState.status === "error") return <ProfileLoadError onRetry={retry} />;
  return <Outlet />;
}
