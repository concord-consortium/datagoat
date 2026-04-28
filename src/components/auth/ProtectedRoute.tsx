import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Loading } from "../Loading";

// Placeholder: gates only on `useAuth().user`. The ProfileLoadState tri-state
// gating extension lands in the form-primitives + UserContext + ProfileForm
// step (next session).
// TODO: extend with ProfileLoadState in UserContext step
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
