import { beforeUserCreated, HttpsError } from "firebase-functions/v2/identity";
import { defineString } from "firebase-functions/params";

// Kill switch — set FACEBOOK_BLOCKER_ENABLED=false in the Firebase console
// (Functions → Configuration) to disable this trigger without a code redeploy.
// Reads at cold-start; existing instances pick up the change on next start.
const BLOCKER_ENABLED = defineString("FACEBOOK_BLOCKER_ENABLED", {
  default: "true",
});

// The [BLOCKED_NO_EMAIL] sentinel is the client-side discriminator for this
// rejection; the rest of the message is the user-facing copy. Keep the
// sentinel stable even if the copy is edited — the client matches on the
// sentinel only.
export const BLOCKED_NO_EMAIL_MESSAGE =
  "[BLOCKED_NO_EMAIL] Your Facebook account does not share an email address with us. Either share your email with Facebook, or sign up with a different method.";

// Structural superset of the AuthBlockingEvent fields this rule reads. Wider
// than the SDK type (email allows null) so unit tests can construct plain
// mocks without casting; the real AuthBlockingEvent passed by the trigger
// below is assignable into this shape.
interface BlockEvent {
  data?: {
    email?: string | null;
    providerData?: { providerId: string }[];
  };
}

// Pure rule extracted so the unit tests can drive it directly without
// depending on the Firebase Functions runtime. The exported trigger below
// just plumbs `event` through this function.
export function evaluateBlockFacebookMissingEmail(
  event: BlockEvent,
  blockerEnabled: string,
): void {
  if (blockerEnabled !== "true") return;
  const providers = event.data?.providerData ?? [];
  const isFacebook = providers.some((p) => p.providerId === "facebook.com");
  const email = event.data?.email;
  if (isFacebook && (typeof email !== "string" || email.trim() === "")) {
    throw new HttpsError("invalid-argument", BLOCKED_NO_EMAIL_MESSAGE);
  }
}

export const blockFacebookMissingEmail = beforeUserCreated((event) => {
  evaluateBlockFacebookMissingEmail(event, BLOCKER_ENABLED.value());
});
