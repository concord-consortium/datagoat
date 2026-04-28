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

interface ProviderEntry {
  providerId: string;
}

interface BeforeCreateEventData {
  email?: string | null;
  providerData?: ProviderEntry[];
}

interface BeforeCreateEvent {
  data?: BeforeCreateEventData;
}

// Pure rule extracted so the unit tests can drive it directly without
// depending on the Firebase Functions runtime. The exported trigger below
// just plumbs `event` through this function.
export function evaluateBlockFacebookMissingEmail(
  event: BeforeCreateEvent,
  blockerEnabled: string,
): void {
  if (blockerEnabled !== "true") return;
  const providers = event.data?.providerData ?? [];
  const isFacebook = providers.some((p) => p.providerId === "facebook.com");
  if (isFacebook && !event.data?.email) {
    throw new HttpsError("invalid-argument", BLOCKED_NO_EMAIL_MESSAGE);
  }
}

export const blockFacebookMissingEmail = beforeUserCreated((event) => {
  evaluateBlockFacebookMissingEmail(
    event as unknown as BeforeCreateEvent,
    BLOCKER_ENABLED.value(),
  );
});
