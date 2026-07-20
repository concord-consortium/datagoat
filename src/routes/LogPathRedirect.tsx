import { Navigate, useLocation } from "react-router-dom";

// The three per-type log pages merged into one at /log. These paths stay as
// redirects so existing bookmarks and the activity calendar's ?date= deep
// link keep working.
export function LogPathRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/log${search}`} replace />;
}
