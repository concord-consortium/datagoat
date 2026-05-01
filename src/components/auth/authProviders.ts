import {
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
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
    }
  | { ok: false; kind: "blocked-no-email"; message: string }
  | { ok: false; kind: "other"; code: string };

// Component-local linking-mode state shape, consumed by LoginForm and
// SignupForm when an account-collision result triggers the inline
// LinkAccountPanel flow. Lives here so the two forms share one source of
// truth instead of duplicating the interface.
export interface LinkingState {
  email: string;
  pendingCredential: AuthCredential;
}

function isAuthError(err: unknown): err is AuthError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code?: unknown }).code === "string"
  );
}

export function extractBlockedNoEmailMessage(err: AuthError): string | null {
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
      // We deliberately do NOT call fetchSignInMethodsForEmail here:
      // exposing the existing-method list to an unauthenticated client
      // leaks account existence + provider, defeating ForgotPassword's
      // enumeration-resistant "If an account exists ..." copy. The link
      // panel offers both Google and email/password and lets the user
      // pick the method they used originally. Google has also deprecated
      // this lookup for the same reason.
      if (pendingCredential && email) {
        return {
          ok: false,
          kind: "account-collision",
          email,
          pendingCredential,
        };
      }
      // The link panel needs email both for user-facing copy and for
      // the post-reauth mismatch-defense comparison; an empty string
      // would produce broken UX and short-circuit that defense. Log
      // with a dedicated stage so this rare provider payload is
      // distinguishable from the generic catch-all below, then return
      // the generic "other" result.
      if (!email) {
        logError(err, {
          stage: "signInWithProvider.collisionMissingEmail",
          code,
        });
        return { ok: false, kind: "other", code };
      }
      // No pending credential — fall through to the generic error path.
    }

    // auth/popup-closed-by-user is a normal user action rather than a fault;
    // revisit the log level (or filter upstream) when real telemetry lands.
    logError(err, { stage: "signInWithProvider", code });
    return { ok: false, kind: "other", code };
  }
}
