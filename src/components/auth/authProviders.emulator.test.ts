// Round-trip integration test for the Facebook-no-email blocking trigger.
//
// Why this exists: the unit tests in functions/ verify the rule's logic and
// the smoke script in functions/scripts verifies the sentinel reaches the
// wire. Neither catches the failure mode this test is built for: a Firebase
// JS SDK update that wraps, truncates, or localizes blocking-function errors
// in a way that strips the [BLOCKED_NO_EMAIL] sentinel from err.message — the
// exact field the client extractor reads. If that ever happens silently,
// every blocked Facebook sign-in turns into a generic "Something went wrong"
// and users retry forever.
//
// Strategy: drive the real firebase/auth SDK against the auth emulator, the
// same path the production client takes (signInWithCredential for a
// Facebook-shaped credential with no email), then run the resulting error
// through extractBlockedNoEmailMessage and assert it returns non-null.
//
// Skips automatically when the auth emulator is not running so `npm test`
// stays green without the emulator. Run `npm run emulators` to enable it.

import { describe, it, expect } from "vitest";
import { initializeApp, deleteApp } from "firebase/app";
import {
  initializeAuth,
  inMemoryPersistence,
  connectAuthEmulator,
  signInWithCredential,
  OAuthProvider,
  type AuthError,
} from "firebase/auth";
import { extractBlockedNoEmailMessage } from "./authProviders";

const EMULATOR_HOST = "127.0.0.1:9099";

const emulatorReachable = await fetch(`http://${EMULATOR_HOST}/`)
  .then((r) => r.ok)
  .catch(() => false);

describe.skipIf(!emulatorReachable)(
  "blockFacebookMissingEmail SDK round-trip",
  () => {
    it("client SDK delivers an error whose message still contains the [BLOCKED_NO_EMAIL] sentinel", async () => {
      const app = initializeApp(
        {
          apiKey: "fake-api-key",
          authDomain: "demo-datagoat.firebaseapp.com",
          projectId: "demo-datagoat",
        },
        // Unique name so this test doesn't fight any default app the suite
        // may have created elsewhere.
        "blocked-no-email-roundtrip",
      );
      try {
        const auth = initializeAuth(app, {
          persistence: inMemoryPersistence,
        });
        connectAuthEmulator(auth, `http://${EMULATOR_HOST}`, {
          disableWarnings: true,
        });

        // OAuthProvider("facebook.com") + JSON-shaped fake id_token mirrors
        // what the smoke script POSTs directly, but goes through the JS SDK
        // so the error wrapping path is exercised end-to-end. Omitting
        // `email` from the id_token claims is what makes the trigger fire.
        const provider = new OAuthProvider("facebook.com");
        const credential = provider.credential({
          idToken: JSON.stringify({ sub: "fb-no-email-roundtrip-test" }),
        });

        let caught: unknown = null;
        try {
          await signInWithCredential(auth, credential);
        } catch (err) {
          caught = err;
        }

        expect(caught, "expected signInWithCredential to reject").not.toBeNull();
        const authError = caught as AuthError;
        expect(authError.code).toBe("auth/internal-error");
        expect(authError.message).toContain("[BLOCKED_NO_EMAIL]");
        expect(extractBlockedNoEmailMessage(authError)).not.toBeNull();
      } finally {
        await deleteApp(app);
      }
    });
  },
);
