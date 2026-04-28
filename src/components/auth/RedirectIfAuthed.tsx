import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Loading } from "../Loading";

// Wraps the auth routes (/login, /signup, /forgot-password, /verify-email).
// Authenticated users land on /dashboard instead of seeing the login form
// again. Without this, signInWithPopup succeeds but the URL stays at /login.
export function RedirectIfAuthed() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
