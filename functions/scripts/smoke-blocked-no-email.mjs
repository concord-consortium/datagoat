// Pre-deploy smoke check for the Facebook-no-email blocking trigger.
//
// What it does: hits the Firebase Auth emulator's signInWithIdp endpoint
// with a Facebook-shaped credential that has no email, and asserts the
// response carries the [BLOCKED_NO_EMAIL] sentinel. This catches code
// regressions that the unit tests can't see — sentinel string drift,
// trigger-decorator misuse, kill-switch confusion, and Firebase SDK
// behavior changes that wrap or truncate the message.
//
// Usage (from repo root, with `npm run emulators` already running):
//   node functions/scripts/smoke-blocked-no-email.mjs
//
// Exit 0 = pass; non-zero = sentinel missing or unexpected response.
//
// Does NOT cover the production deploy itself — see CLAUDE.md for the
// post-deploy verification steps (firebase functions:list, console
// checks for Identity Platform + FACEBOOK_BLOCKER_ENABLED parameter).

const HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "demo-datagoat";
const URL = `http://${HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake-api-key`;
const SENTINEL = "[BLOCKED_NO_EMAIL]";

async function probeEmulator() {
  try {
    const res = await fetch(`http://${HOST}/`);
    if (!res.ok) {
      throw new Error(`status ${res.status}`);
    }
  } catch (err) {
    console.error(
      `Auth emulator not reachable at ${HOST}. Start it with \`npm run emulators\` first.\n  Underlying: ${err.message}`,
    );
    process.exit(2);
  }
}

async function postSignInWithIdp(postBody) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Project-Id": PROJECT,
    },
    body: JSON.stringify({
      postBody,
      requestUri: "http://localhost",
      returnSecureToken: true,
    }),
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

await probeEmulator();

// The emulator accepts a JSON-shaped fake IDP response in `id_token`.
// Sub identifies the IDP user; we deliberately omit `email` so the
// trigger fires.
const idTokenNoEmail = JSON.stringify({ sub: "fb-no-email-smoke-user" });
const postBody = `id_token=${encodeURIComponent(idTokenNoEmail)}&providerId=facebook.com`;

const { status, body } = await postSignInWithIdp(postBody);

if (status === 200) {
  console.error(
    `FAIL: signInWithIdp returned 200 OK for a Facebook user with no email — the blocking trigger did not fire.\n  Body: ${JSON.stringify(body)}`,
  );
  process.exit(1);
}

const message = body?.error?.message ?? body?.message ?? JSON.stringify(body);
if (typeof message === "string" && message.includes(SENTINEL)) {
  console.log(`OK: blocking trigger fired and ${SENTINEL} survived to the client.`);
  console.log(`  status=${status}, message=${message}`);
  process.exit(0);
}

console.error(
  `FAIL: response did not include the ${SENTINEL} sentinel.\n  status=${status}\n  body=${JSON.stringify(body)}`,
);
process.exit(1);
