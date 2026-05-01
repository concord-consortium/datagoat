// Maps Firebase Auth error codes to user-facing copy. Extracted from the
// pre-Session-2 Login.tsx; extended with the OAuth popup-flow rejections.
//
// Two cases are intentionally NOT mapped here:
//   * `auth/account-exists-with-different-credential` triggers the inline
//     LinkAccountPanel, not a generic error.
//   * `blocked-no-email` (Cloud Function rejection) renders the message from
//     the Cloud Function directly, sentinel-stripped — the function is the
//     single source of truth for the copy.
export const authErrorMessages: Record<string, string> = {
  "auth/user-not-found": "Invalid email or password",
  "auth/wrong-password": "Invalid email or password",
  "auth/invalid-credential": "Invalid email or password",
  "auth/email-already-in-use": "An account with this email already exists",
  "auth/weak-password": "Password must be at least 6 characters",
  "auth/invalid-email": "Please enter a valid email address",
  "auth/too-many-requests": "Too many attempts. Please try again later",
  "auth/network-request-failed": "Network error. Check your connection",
  "auth/popup-closed-by-user": "Sign-in cancelled",
  "auth/popup-blocked":
    "Sign-in popup was blocked. If you're using Private Browsing or an in-app browser (like the one inside Instagram or Facebook), open this site in a standard browser (Safari or Chrome) and try again. Otherwise you can sign in with email and password below.",
  "auth/cancelled-popup-request": "Sign-in cancelled",
};

export const DEFAULT_AUTH_ERROR_MESSAGE = "Something went wrong. Please try again";

export function authErrorMessageFor(code: string | undefined): string {
  if (code && code in authErrorMessages) return authErrorMessages[code];
  return DEFAULT_AUTH_ERROR_MESSAGE;
}

export function getAuthErrorCode(err: unknown): string {
  const rawCode =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;
  return typeof rawCode === "string" && rawCode ? rawCode : "auth/internal-error";
}
