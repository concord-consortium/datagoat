// Local admin metrics export for DataGOAT.
//
// Pulls a summary of users over time from the PRODUCTION project and writes
// two CSV files:
//
//   1. <out>/datagoat-users-<stamp>.csv    — one row per user (roster)
//   2. <out>/datagoat-summary-<stamp>.csv  — one row per time bucket (trend)
//
// Data sources:
//   - Firebase Auth (admin.auth().listUsers) → signup time, last sign-in,
//     email + verification state. Signup/active timestamps do NOT live in
//     Firestore.
//   - Firestore → /users/{uid}/profile/main (demographics, completion flags)
//     and the healthEntries / competitionEntries / performanceEntries
//     subcollections. Entry doc ids ARE the YYYY-MM-DD date, so we read only
//     document ids (listDocuments) to get activity dates without paying to
//     read every entry body.
//
// This is an occasional ops pull, run by a developer against prod — there is
// no public surface and no auth layer. It authenticates with Application
// Default Credentials.
//
// Setup (one time):
//   gcloud auth application-default login
//   # or: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
//
// Usage (from repo root):
//   node functions/scripts/metrics-export.mjs
//   node functions/scripts/metrics-export.mjs --bucket=month --out=./tmp
//   FIREBASE_PROJECT_ID=datagoat-b07dd node functions/scripts/metrics-export.mjs
//
// Flags:
//   --bucket=day|week|month   time granularity for the summary file (default week)
//   --out=<dir>               output directory (default current directory)
//   --project=<id>            project id (default $FIREBASE_PROJECT_ID or datagoat-b07dd)

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { bucket: "week", out: ".", project: process.env.FIREBASE_PROJECT_ID || "datagoat-b07dd" };
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  if (!["day", "week", "month"].includes(out.bucket)) {
    console.error(`Invalid --bucket=${out.bucket}; expected day|week|month`);
    process.exit(2);
  }
  return out;
}

const ENTRY_COLLECTIONS = ["healthEntries", "competitionEntries", "performanceEntries"];

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Dates / buckets
// ---------------------------------------------------------------------------

// Returns YYYY-MM-DD (UTC) for a Date, or "" for an invalid/missing date.
function isoDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

// Bucket key for a YYYY-MM-DD string under the chosen granularity.
//   day   → "2026-05-04"
//   week  → ISO-week Monday, e.g. "2026-05-04"
//   month → "2026-05"
function bucketKey(isoDateStr, granularity) {
  if (!isoDateStr) return "";
  if (granularity === "month") return isoDateStr.slice(0, 7);
  if (granularity === "day") return isoDateStr;
  // week: snap to the Monday of that ISO week (UTC).
  const d = new Date(`${isoDateStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

// All bucket keys from minKey..maxKey inclusive, so empty buckets show as 0.
function bucketRange(minKey, maxKey, granularity) {
  if (!minKey || !maxKey) return [];
  const keys = [];
  if (granularity === "month") {
    let [y, m] = minKey.split("-").map(Number);
    const [my, mm] = maxKey.split("-").map(Number);
    while (y < my || (y === my && m <= mm)) {
      keys.push(`${y}-${String(m).padStart(2, "0")}`);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return keys;
  }
  const step = granularity === "week" ? 7 : 1;
  let cur = new Date(`${minKey}T00:00:00Z`);
  const end = new Date(`${maxKey}T00:00:00Z`);
  while (cur.getTime() <= end.getTime()) {
    keys.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + step);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Firestore reads
// ---------------------------------------------------------------------------

async function readProfile(db, uid) {
  const snap = await db.doc(`users/${uid}/profile/main`).get();
  return snap.exists ? snap.data() : null;
}

// Returns the set of YYYY-MM-DD entry dates for one user across all three
// data subcollections, plus per-collection counts. Uses listDocuments so we
// pay only for id metadata, not entry bodies.
async function readActivity(db, uid) {
  const counts = {};
  const allDates = new Set();
  for (const coll of ENTRY_COLLECTIONS) {
    const refs = await db.collection(`users/${uid}/${coll}`).listDocuments();
    counts[coll] = refs.length;
    for (const ref of refs) {
      // Doc id is the date; guard against any stray non-date id.
      if (/^\d{4}-\d{2}-\d{2}$/.test(ref.id)) allDates.add(ref.id);
    }
  }
  return { counts, dates: allDates };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));

initializeApp({ credential: applicationDefault(), projectId: args.project });
const auth = getAuth();
const db = getFirestore();

console.error(`Exporting metrics for project "${args.project}" (bucket=${args.bucket})...`);

// 1. Pull every auth user (paginated).
const users = [];
let pageToken;
do {
  let page;
  try {
    page = await auth.listUsers(1000, pageToken);
  } catch (err) {
    console.error(
      `Failed to list users. Are you authenticated for "${args.project}"?\n` +
        `  Run: gcloud auth application-default login\n` +
        `  Underlying: ${err.message}`,
    );
    process.exit(1);
  }
  users.push(...page.users);
  pageToken = page.pageToken;
} while (pageToken);

console.error(`  ${users.length} auth users; reading profiles + activity...`);

// 2. For each user, join profile + activity.
const roster = [];
const activeByBucket = new Map(); // bucketKey -> Set<uid>
const entriesByBucket = new Map(); // bucketKey -> entry-date count

for (const u of users) {
  const profile = await readProfile(db, u.uid);
  const { counts, dates } = await readActivity(db, u.uid);

  const sortedDates = [...dates].sort();
  const signup = u.metadata?.creationTime ? new Date(u.metadata.creationTime) : null;
  const lastSignIn = u.metadata?.lastSignInTime ? new Date(u.metadata.lastSignInTime) : null;

  roster.push({
    uid: u.uid,
    email: u.email ?? profile?.email ?? "",
    emailVerified: u.emailVerified,
    signupDate: isoDay(signup),
    lastSignInDate: isoDay(lastSignIn),
    providers: (u.providerData ?? []).map((p) => p.providerId).join("|"),
    gender: profile?.gender ?? "",
    athleteType: profile?.athleteType ?? "",
    age: profile?.age ?? "",
    profileComplete: profile?.profileComplete ?? "",
    trackingSetupComplete: profile?.trackingSetupComplete ?? "",
    hasProfile: profile !== null,
    healthEntries: counts.healthEntries,
    competitionEntries: counts.competitionEntries,
    performanceEntries: counts.performanceEntries,
    daysActive: dates.size,
    firstEntryDate: sortedDates[0] ?? "",
    lastEntryDate: sortedDates[sortedDates.length - 1] ?? "",
  });

  // Activity per bucket: a user is "active" in a bucket if they logged any
  // entry dated within it.
  for (const dateStr of dates) {
    const key = bucketKey(dateStr, args.bucket);
    if (!activeByBucket.has(key)) activeByBucket.set(key, new Set());
    activeByBucket.get(key).add(u.uid);
    entriesByBucket.set(key, (entriesByBucket.get(key) ?? 0) + 1);
  }
}

// 3. Build the per-bucket summary.
// Determine the full bucket range from earliest signup/activity to today.
const allKeys = [];
for (const r of roster) {
  if (r.signupDate) allKeys.push(bucketKey(r.signupDate, args.bucket));
}
for (const key of activeByBucket.keys()) allKeys.push(key);
allKeys.sort();
const minKey = allKeys[0] ?? "";
const todayKey = bucketKey(isoDay(new Date()), args.bucket);
const maxKey = allKeys.length ? (allKeys[allKeys.length - 1] > todayKey ? allKeys[allKeys.length - 1] : todayKey) : todayKey;

// New signups per bucket, split by demographic, plus cumulative.
const signupsByBucket = new Map(); // key -> { total, byAthlete:{}, byGender:{} }
for (const r of roster) {
  if (!r.signupDate) continue;
  const key = bucketKey(r.signupDate, args.bucket);
  if (!signupsByBucket.has(key)) signupsByBucket.set(key, { total: 0, endurance: 0, strength: 0, male: 0, female: 0, otherGender: 0, verified: 0 });
  const b = signupsByBucket.get(key);
  b.total += 1;
  if (r.athleteType === "endurance") b.endurance += 1;
  else if (r.athleteType === "strength") b.strength += 1;
  if (r.gender === "male") b.male += 1;
  else if (r.gender === "female") b.female += 1;
  else b.otherGender += 1;
  if (r.emailVerified) b.verified += 1;
}

const summary = [];
let cumulativeUsers = 0;
let cumulativeVerified = 0;
for (const key of bucketRange(minKey, maxKey, args.bucket)) {
  const s = signupsByBucket.get(key) ?? { total: 0, endurance: 0, strength: 0, male: 0, female: 0, otherGender: 0, verified: 0 };
  cumulativeUsers += s.total;
  cumulativeVerified += s.verified;
  summary.push({
    bucket: key,
    newSignups: s.total,
    cumulativeUsers,
    newVerified: s.verified,
    cumulativeVerified,
    activeUsers: activeByBucket.get(key)?.size ?? 0,
    totalEntries: entriesByBucket.get(key) ?? 0,
    newSignupsEndurance: s.endurance,
    newSignupsStrength: s.strength,
    newSignupsMale: s.male,
    newSignupsFemale: s.female,
    newSignupsOtherGender: s.otherGender,
  });
}

// 4. Write both files.
const stamp = isoDay(new Date());
const rosterHeaders = [
  "uid", "email", "emailVerified", "signupDate", "lastSignInDate", "providers",
  "gender", "athleteType", "age", "profileComplete", "trackingSetupComplete", "hasProfile",
  "healthEntries", "competitionEntries", "performanceEntries",
  "daysActive", "firstEntryDate", "lastEntryDate",
];
const summaryHeaders = [
  "bucket", "newSignups", "cumulativeUsers", "newVerified", "cumulativeVerified",
  "activeUsers", "totalEntries",
  "newSignupsEndurance", "newSignupsStrength",
  "newSignupsMale", "newSignupsFemale", "newSignupsOtherGender",
];

mkdirSync(resolve(args.out), { recursive: true });
const rosterPath = resolve(args.out, `datagoat-users-${stamp}.csv`);
const summaryPath = resolve(args.out, `datagoat-summary-${stamp}.csv`);
writeFileSync(rosterPath, toCsv(rosterHeaders, roster));
writeFileSync(summaryPath, toCsv(summaryHeaders, summary));

console.error(`Wrote ${roster.length} users      → ${rosterPath}`);
console.error(`Wrote ${summary.length} ${args.bucket} buckets → ${summaryPath}`);
