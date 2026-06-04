# DataGOAT

Own Your Sports Data for Peak Performance.

A mobile-first PWA for student athletes to track daily health metrics, sport outcomes, and earn badges for consistency. Built with React, TypeScript, Vite, and Firebase.

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`)
- A Firebase project (or use the emulator for fully local development)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and fill in your Firebase config:

   ```bash
   cp .env.example .env.local
   ```

   The required variables are:

   ```
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   ```

   When running against the Firebase emulator, most of these values can be any placeholder, but the project ID needs to be lowercase and hyphen-allowed (use `demo-<anything>`, e.g., `demo-datagoat` for emulator work). The emulator toggle (`VITE_USE_EMULATORS`) is no longer set in `.env.local`; it lives in `.env.emulators` and `.env.cloud` and is selected automatically by the `npm run dev` and `npm run dev:cloud` scripts via Vite's `--mode` flag. See [CLAUDE.md](CLAUDE.md) for details.

## Local Development

Start the Firebase emulators and the Vite dev server in two terminals:

**Terminal 1 — Firebase Emulators** (Auth on port 9099, Firestore on 8080, Hosting on 5000):

```bash
npm run emulators
```

**Terminal 2 — Vite Dev Server** (hot reload on http://localhost:5173):

```bash
npm run dev
```

## Preview channels

Firebase Hosting preview channels publish a temporary URL pointing at a build of the app, useful for testing changes against the real Firebase project before promoting to production.

```bash
npm run deploy:preview -- <channel-name>
```

(The `--` separates npm's args from the script's args; the channel name is forwarded to `firebase hosting:channel:deploy`.) The CLI prints a URL like `https://<project>--<channel-name>-<hash>.web.app`. The script sets a 30-day expiry (the maximum); without that, channels auto-expire after 7 days.

Only **hosting** is channel-isolated. **Cloud Functions, Firestore data, and Auth state** are project-level and shared with production — sign-ins and writes from the preview URL hit the same backend as the live site.

To list or delete channels:

```bash
firebase hosting:channel:list
firebase hosting:channel:delete <channel-name>
```

## Metrics export

`functions/scripts/metrics-export.mjs` pulls a summary of users over time from the **production** project and writes two CSV files: a per-user roster and a per-time-bucket trend. It is a local admin script run by a developer — there is no public endpoint and no auth layer in the script itself; it reads prod directly using your own credentials via the Firebase Admin SDK.

It joins **Firebase Auth** (signup time, last sign-in, email verification — these do not live in Firestore) with **Firestore** (`/users/{uid}/profile/main` demographics + the `healthEntries` / `competitionEntries` / `performanceEntries` subcollections). Activity dates are read via `listDocuments()`, which fetches only document ids (each entry's id is its `YYYY-MM-DD` date), so it does not pay to read every entry body just to count active days.

### 1. Authenticate (one time)

The script uses Application Default Credentials. Either log in with the gcloud CLI:

```bash
gcloud auth application-default login
```

or point at a downloaded service-account key:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

Your account needs read access to Auth and Firestore on the `datagoat-b07dd` project.

### 2. Run

```bash
npm --prefix functions run metrics:export -- --bucket=week --out=./tmp
```

(The `--` separates npm's args from the script's args.) On success it prints the two output paths. Note that `--prefix functions` runs with the working directory set to `functions/`, so a relative `--out=./tmp` lands at `functions/tmp/`; pass an absolute path to write elsewhere. The output directory is created if it does not exist.

### Output files

| File | One row per | Columns |
| --- | --- | --- |
| `datagoat-users-<date>.csv` | user | `uid`, `email`, `emailVerified`, `signupDate`, `lastSignInDate`, `providers`, `gender`, `athleteType`, `age`, `profileComplete`, `trackingSetupComplete`, `hasProfile`, `healthEntries`, `competitionEntries`, `performanceEntries`, `daysActive`, `firstEntryDate`, `lastEntryDate` |
| `datagoat-summary-<date>.csv` | time bucket | `bucket`, `newSignups`, `cumulativeUsers`, `newVerified`, `cumulativeVerified`, `activeUsers`, `totalEntries`, and new-signup splits by athlete type (`newSignupsEndurance`, `newSignupsStrength`) and gender (`newSignupsMale`, `newSignupsFemale`, `newSignupsOtherGender`) |

A user counts as **active** in a bucket if they logged at least one entry dated within it. Buckets span from the earliest signup/activity through today, with empty buckets included as zeros.

### Options

| Flag | Default | Description |
| --- | --- | --- |
| `--bucket=day\|week\|month` | `week` | Time granularity for the summary file. Weeks snap to the ISO-week Monday (UTC); months are `YYYY-MM`. |
| `--out=<dir>` | current directory | Output directory for both CSVs (created if missing). |
| `--project=<id>` | `$FIREBASE_PROJECT_ID` or `datagoat-b07dd` | Firebase project to read from. |

## Available Scripts

| Script                     | Description                                                          |
| -------------------------- | -------------------------------------------------------------------- |
| `npm run dev`              | Vite dev server pointed at local Firebase emulators (hot reload)     |
| `npm run dev:cloud`        | Vite dev server pointed at the cloud Firebase project (no emulators) |
| `npm run build`            | TypeScript check + production Vite build                             |
| `npm run preview`          | Preview the production build locally                                 |
| `npm run emulators`        | Start Firebase emulators (Auth, Firestore, Functions, Hosting)       |
| `npm run deploy`           | Build and deploy hosting + functions + Firestore rules               |
| `npm run deploy:hosting`   | Build and deploy only Firebase Hosting (skips functions + rules)     |
| `npm run deploy:functions` | Redeploy only the Cloud Functions                                    |
| `npm run deploy:preview`   | Build + publish a preview channel (30-day expiry, `-- <channel-name>`) |

## Tech Stack

- **React 19** + TypeScript + Vite
- **Firebase** — Authentication (email/password), Firestore, Hosting
- **vite-plugin-pwa** for service worker and offline support

## Architecture

For a high-level tour of how the app works (provider tree, routing, data model, optimistic writes, CODAP plugin flow, auth + blocking trigger, PWA), see [ARCHITECTURE.md](ARCHITECTURE.md).
