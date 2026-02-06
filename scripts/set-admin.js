#!/usr/bin/env node

// Usage: node scripts/set-admin.js user@example.com
// Sets the Firebase custom claim { admin: true } for the given user.
// Requires GOOGLE_APPLICATION_CREDENTIALS or Firebase emulator running.

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

initializeApp();

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/set-admin.js user@example.com");
  process.exit(1);
}

const auth = getAuth();

try {
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { admin: true });
  console.log(`Admin claim set for ${email} (uid: ${user.uid})`);
} catch (err) {
  console.error("Error setting admin claim:", err);
  process.exit(1);
}
