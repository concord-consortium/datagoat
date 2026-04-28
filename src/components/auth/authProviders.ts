import {
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  fetchSignInMethodsForEmail,
  type AuthProvider,
  type AuthError,
  type AuthCredential,
  type User,
} from "firebase/auth";
import { auth } from "../../firebase";
import { logError } from "../../utils/logError";

export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();
// Facebook needs `email` scope explicitly. The user can deny it; the
// beforeUserCreated Cloud Function rejects sign-ins where email is null.
facebookProvider.addScope("email");

const BLOCKED_NO_EMAIL_SENTINEL = "[BLOCKED_NO_EMAIL]";

export type SignInResult =
  | { ok: true; user: User }
  | {
      ok: false;
      kind: "account-collision";
      email: string;
      pendingCredential: AuthCredential;
      existingMethods: string[];
    }
  | { ok: false; kind: "blocked-no-email"; message: string }
  | { ok: false; kind: "other"; code: string };

function isAuthError(err: unknown): err is AuthError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code?: unknown }).code === "string"
  );
}

function extractBlockedNoEmailMessage(err: AuthError): string | null {
  // Blocking-function rejections surface as auth/internal-error with the
  // thrown message embedded in error.message. We match the sentinel,
  // strip it, and return the remainder as the user-facing copy.
  const message = typeof err.message === "string" ? err.message : "";
  const idx = message.indexOf(BLOCKED_NO_EMAIL_SENTINEL);
  if (idx === -1) return null;
  const after = message.slice(idx + BLOCKED_NO_EMAIL_SENTINEL.length).trim();
  // If nothing followed the sentinel (defensive), provide a fallback.
  return after || "Your sign-in was rejected. Try a different method.";
}

export async function signInWithProvider(
  provider: AuthProvider,
): Promise<SignInResult> {
  try {
    const result = await signInWithPopup(auth, provider);
    return { ok: true, user: result.user };
  } catch (err: unknown) {
    if (!isAuthError(err)) {
      logError(err, { stage: "signInWithProvider", phase: "non-auth-error" });
      return { ok: false, kind: "other", code: "auth/internal-error" };
    }

    const code = err.code;

    if (code === "auth/internal-error") {
      const blockedMessage = extractBlockedNoEmailMessage(err);
      if (blockedMessage) {
        // Don't logError — this is a server-policy rejection we expected.
        return {
          ok: false,
          kind: "blocked-no-email",
          message: blockedMessage,
        };
      }
    }

    if (code === "auth/account-exists-with-different-credential") {
      const customData = (err as AuthError).customData as
        | { email?: unknown }
        | undefined;
      const email =
        customData && typeof customData.email === "string"
          ? customData.email
          : "";
      const pendingCredential = FacebookAuthProvider.credentialFromError(err);
      let existingMethods: string[] = [];
      if (email) {
        try {
          existingMethods = await fetchSignInMethodsForEmail(auth, email);
        } catch (lookupErr) {
          logError(lookupErr, {
            stage: "fetchSignInMethodsForEmail",
            email,
          });
        }
      }
      if (pendingCredential) {
        return {
          ok: false,
          kind: "account-collision",
          email,
          pendingCredential,
          existingMethods,
        };
      }
      // No pending credential — fall through to the generic error path.
    }

    if (code === "auth/popup-closed-by-user") {
      // Normal user action; log at debug-level via console.debug. logError is
      // also called so future telemetry can categorize.
      logError(err, { stage: "signInWithProvider", code });
    } else {
      logError(err, { stage: "signInWithProvider", code });
    }
    return { ok: false, kind: "other", code };
  }
}
