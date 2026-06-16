// Tracks whether this device has ever had a signed-in DataGOAT user, so the
// auth guards can send brand-new visitors to /signup ("Create Your Account")
// rather than /login ("Welcome back"). The flag is set once a user
// authenticates (AuthContext) and read when no user is present
// (ProtectedRoute / OnboardingRoute).
const RETURNING_USER_KEY = "datagoat:returningUser";

// localStorage can throw in Safari Private Browsing and locked-down browser
// policies (same hazard handled in VerificationBanner). Treat any failure as
// "first-time" rather than letting the throw escape the routing surface.
export function isReturningUser(): boolean {
  try {
    return localStorage.getItem(RETURNING_USER_KEY) === "1";
  } catch {
    return false;
  }
}

export function markReturningUser(): void {
  try {
    localStorage.setItem(RETURNING_USER_KEY, "1");
  } catch {
    // Persisting failed (private mode, quota, policy). Harmless: the visitor
    // just sees /signup again next time instead of /login.
  }
}

// Default auth landing for an unauthenticated visitor: returning users see
// /login, first-timers see /signup.
export function authLandingPath(): "/login" | "/signup" {
  return isReturningUser() ? "/login" : "/signup";
}
