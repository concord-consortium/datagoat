import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Loading } from "../Loading";

// Wraps /login, /signup, and /forgot-password (NOT /verify-email — see
// AppRoutes.tsx for that exception). Authenticated users are sent on so
// signInWithPopup success actually leaves the auth screen.
//
// Verified-or-trusted users go to /dashboard. Unverified users go to
// /verify-email to mirror LoginForm.handleOAuth's branch — without this,
// a user who signs up, lands on /verify-email, then refreshes back to
// /login gets bounced to /dashboard, defeating the verification holding
// pattern.
export function RedirectIfAuthed() {
  const { user, loading, isEmailVerifiedOrTrusted } = useAuth();
  if (loading) return <Loading />;
  if (user) {
    return (
      <Navigate
        to={isEmailVerifiedOrTrusted ? "/dashboard" : "/verify-email"}
        replace
      />
    );
  }
  return <Outlet />;
}
