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

   `.env.local` holds source-of-truth config for both cloud projects as **non-`VITE_`-prefixed** vars, one set per environment:

   ```
   FIREBASE_STAGING_API_KEY=
   FIREBASE_STAGING_AUTH_DOMAIN=
   FIREBASE_STAGING_PROJECT_ID=
   FIREBASE_STAGING_STORAGE_BUCKET=
   FIREBASE_STAGING_MESSAGING_SENDER_ID=
   FIREBASE_STAGING_APP_ID=
   FIREBASE_STAGING_MEASUREMENT_ID=
   # ...and the matching FIREBASE_PRODUCTION_* set
   ```

   The committed `.env.staging` / `.env.production` files map these into the `VITE_FIREBASE_*` vars the app reads, via `${VAR}` expansion. The `VITE_` prefix is omitted on the source vars so a given build bundles only one project's config; see the **Environments** section of [CLAUDE.md](CLAUDE.md) for the full rationale. For purely local emulator work you don't need real values — `.env.emulators` supplies dummy `VITE_FIREBASE_*` values and sets `VITE_USE_EMULATORS=true`, selected automatically by `npm run dev` via Vite's `--mode` flag.

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

Firebase Hosting preview channels publish a temporary URL pointing at a build of the app, useful for sharing in-progress changes with stakeholders. They are published to the **staging** project (the script builds with `--mode staging`), so they never touch production users.

```bash
npm run deploy:preview -- <channel-name>
```

(The `--` separates npm's args from the script's args; the channel name is forwarded to `firebase hosting:channel:deploy`.) The CLI prints a URL like `https://datagoat-staging--<channel-name>-<hash>.web.app`. The script sets a 30-day expiry (the maximum); without that, channels auto-expire after 7 days.

Only **hosting** is channel-isolated. **Cloud Functions, Firestore data, and Auth state** are project-level and shared with the rest of staging — sign-ins and writes from the preview URL hit the staging backend.

To list or delete channels:

```bash
firebase hosting:channel:list -P staging
firebase hosting:channel:delete <channel-name> -P staging
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
| `npm run dev`                      | Vite dev server pointed at local Firebase emulators (hot reload)       |
| `npm run dev:staging`              | Vite dev server pointed at the staging cloud project (no emulators)    |
| `npm run dev:production`           | Vite dev server pointed at the production cloud project (rare)         |
| `npm run build`                    | TypeScript check + production Vite build (alias for `build:production`) |
| `npm run build:staging`            | TypeScript check + staging Vite build                                  |
| `npm run build:production`         | TypeScript check + production Vite build                               |
| `npm run preview`                  | Preview the last build locally                                         |
| `npm run emulators`                | Start Firebase emulators (Auth, Firestore, Functions, Hosting)         |
| `npm run deploy:staging`           | Build + deploy hosting + functions + Firestore to staging             |
| `npm run deploy:production`        | Build + deploy hosting + functions + Firestore to production          |
| `npm run deploy:staging:hosting`   | Build + deploy only Firebase Hosting to staging                       |
| `npm run deploy:production:hosting` | Build + deploy only Firebase Hosting to production                   |
| `npm run deploy:staging:functions` | Redeploy only the Cloud Functions on staging                          |
| `npm run deploy:production:functions` | Redeploy only the Cloud Functions on production                    |
| `npm run deploy:preview`           | Build (staging) + publish a preview channel (`-- <channel-name>`)     |

## Tech Stack

- **React 19** + TypeScript + Vite
- **Firebase** — Authentication (email/password), Firestore, Hosting
- **vite-plugin-pwa** for service worker and offline support

## Architecture

For a high-level tour of how the app works (provider tree, routing, data model, optimistic writes, CODAP plugin flow, auth + blocking trigger, PWA), see [ARCHITECTURE.md](ARCHITECTURE.md).
