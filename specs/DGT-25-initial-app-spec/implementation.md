# Implementation Plan: DataGOAT — Initial Web App

**Jira**: https://concord-consortium.atlassian.net/browse/DGT-25
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

### Project scaffolding and tooling

**Summary**: Bootstrap the React + Vite project with all dependencies, configure Tailwind CSS + DaisyUI with the custom `datagoat` theme, set up Firebase project config and emulator, and wire up the PWA manifest. This produces a running dev environment with the correct brand styling, fonts, and Firebase connection — the foundation everything else builds on.

**Files affected**:
- `package.json` — project metadata and all dependencies
- `vite.config.ts` — Vite config with PWA plugin
- `tsconfig.json` / `tsconfig.app.json` — TypeScript config
- `tailwind.config.ts` — Tailwind + DaisyUI with `datagoat` theme
- `postcss.config.js` — PostCSS with Tailwind
- `src/index.css` — Tailwind directives + Lato font import
- `src/main.tsx` — App entry point
- `src/App.tsx` — Stub root component
- `public/manifest.json` — PWA manifest with DataGOAT branding
- `index.html` — HTML shell with Lato font preload
- `firebase.json` — Firebase project config (hosting, emulators)
- `.firebaserc` — Firebase project alias
- `.env.example` — Firebase config env vars template
- `.gitignore` — updated for Firebase, Vite, node_modules

**Estimated diff size**: ~300 lines

**Details**:

Scaffold with `npm create vite@latest . -- --template react-ts` (into existing repo). Install dependencies:
- Core: `react`, `react-dom`, `react-router-dom`
- Firebase: `firebase`
- Styling: `tailwindcss`, `@tailwindcss/typography`, `daisyui`, `postcss`, `autoprefixer`
- Charts: `chart.js`, `react-chartjs-2`
- PWA: `vite-plugin-pwa`
- Dev: `typescript`, `@types/react`, `@types/react-dom`, `eslint`

Tailwind config with the custom DaisyUI theme:
```ts
// tailwind.config.ts
import daisyui from "daisyui";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Lato", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        datagoat: {
          "primary": "#0693e3",
          "primary-content": "#ffffff",
          "secondary": "#ffc222",
          "secondary-content": "#1f1f1f",
          "accent": "#7bdcb5",
          "accent-content": "#1f1f1f",
          "neutral": "#32373c",
          "neutral-content": "#ffffff",
          "base-100": "#ffffff",
          "base-200": "#f5f5f5",
          "base-300": "#e5e5e5",
          "base-content": "#1f1f1f",
          "info": "#0693e3",
          "success": "#7bdcb5",
          "warning": "#ffc222",
          "error": "#e53e3e",
        },
      },
    ],
  },
};
```

PWA manifest:
```json
{
  "name": "DataGOAT",
  "short_name": "DataGOAT",
  "description": "Own Your Sports Data for Peak Performance",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffc222",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Firebase emulator config in `firebase.json`:
```json
{
  "firestore": { "rules": "firestore.rules" },
  "hosting": { "public": "dist", "rewrites": [{ "source": "**", "destination": "/index.html" }] },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "hosting": { "port": 5000 },
    "ui": { "enabled": true }
  }
}
```

---

### Firebase services and data versioning infrastructure

**Summary**: Create the Firebase initialization module, typed Firestore helpers with automatic schema version checking, and the migration registry. This is the data layer foundation — every subsequent step that reads/writes Firestore depends on this.

**Files affected**:
- `src/services/firebase.ts` — Firebase app init, Firestore and Auth exports
- `src/services/firestore.ts` — Typed read/write helpers with `schemaVersion` enforcement
- `src/migrations/index.ts` — Migration registry and `migrateDocument()` function
- `src/migrations/types.ts` — Migration type definitions
- `firestore.rules` — Initial Firestore security rules (user-level access)

**Estimated diff size**: ~250 lines

**Details**:

`src/services/firebase.ts`:
```ts
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";

const app = initializeApp({ /* from env vars */ });
export const db = getFirestore(app);
export const auth = getAuth(app);

if (import.meta.env.DEV) {
  connectFirestoreEmulator(db, "localhost", 8080);
  connectAuthEmulator(auth, "http://localhost:9099");
}
```

`src/services/firestore.ts` — wraps Firestore reads with migration:
```ts
import { migrateDocument } from "../migrations";

export async function getDocWithMigration<T>(ref: DocumentReference): Promise<T | null> {
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return migrateDocument(ref.path, data) as T;
}

export async function setDocWithVersion<T extends Record<string, unknown>>(
  ref: DocumentReference,
  data: T,
  currentVersion: number,
): Promise<void> {
  await setDoc(ref, { ...data, schemaVersion: currentVersion });
}
```

`src/migrations/index.ts`:
```ts
type MigrationFn = (data: Record<string, unknown>) => Record<string, unknown>;
type MigrationKey = `${string}:${number}`; // "profile:1" → migrate from v1 to v2

const registry = new Map<MigrationKey, MigrationFn>();

export function registerMigration(docType: string, fromVersion: number, fn: MigrationFn) {
  registry.set(`${docType}:${fromVersion}`, fn);
}

export function migrateDocument(docType: string, data: Record<string, unknown>): Record<string, unknown> {
  let current = data;
  let version = (current.schemaVersion as number) ?? 1;
  while (registry.has(`${docType}:${version}`)) {
    current = registry.get(`${docType}:${version}`)!(current);
    version++;
    current.schemaVersion = version;
  }
  return current;
}
```

Initial `firestore.rules`:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // Admin-readable config collections
    match /config/{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
  }
}
```

---

### Authentication flows

**Summary**: Implement registration, login, password reset, logout, and email verification. Includes the auth context provider, protected route wrapper, and the verification reminder banner. After this step, users can create accounts and reach a protected shell.

**Files affected**:
- `src/contexts/AuthContext.tsx` — Auth state provider with onAuthStateChanged listener
- `src/pages/LoginPage.tsx` — Login form with error handling
- `src/pages/RegisterPage.tsx` — Registration form, sends verification email, redirects to profile
- `src/pages/ForgotPasswordPage.tsx` — Password reset email form
- `src/components/ProtectedRoute.tsx` — Redirects unauthenticated users to login
- `src/components/EmailVerificationBanner.tsx` — Banner reminding unverified users (shows after 7 days)

**Estimated diff size**: ~400 lines

**Details**:

`AuthContext` provides: `user`, `loading`, `isAdmin`, `isEmailVerified`, `daysUnverified`. The `isAdmin` flag is read from custom claims via `getIdTokenResult()`. The context wraps the entire app in `main.tsx`.

Login/Register pages use DaisyUI form components (`input`, `btn`, `card`). Error states show DaisyUI `alert` components with specific Firebase Auth error messages (e.g., "email already in use", "weak password", "invalid credentials").

Registration flow:
1. `createUserWithEmailAndPassword(auth, email, password)`
2. `sendEmailVerification(auth.currentUser)`
3. Navigate to `/profile` (profile setup)

Login flow:
1. `signInWithEmailAndPassword(auth, email, password)`
2. Navigate to `/dashboard`

`ProtectedRoute` checks `AuthContext` — if no user, redirects to `/login`. If user exists but profile incomplete, redirects to `/profile`.

`EmailVerificationBanner` calculates days since `user.metadata.creationTime` and shows a dismissible warning after 7 days if `!user.emailVerified`.

---

### App layout, navigation, and routing

**Summary**: Build the app shell with the header (DataGOAT branding), hamburger menu with slide-out drawer, and React Router configuration for all pages. After this step, navigation between all screens works.

**Files affected**:
- `src/components/AppLayout.tsx` — Header bar + drawer + main content area
- `src/components/HamburgerMenu.tsx` — Slide-out drawer with menu items and active indicator
- `src/App.tsx` — React Router with all route definitions
- `src/components/ProtectedRoute.tsx` — Updated to wrap `AppLayout`

**Estimated diff size**: ~250 lines

**Details**:

`AppLayout` renders:
- A fixed header with the DataGOAT logo / "#Sport_is_Science" tagline (uses `secondary` theme color — gold) and a hamburger icon button
- The `HamburgerMenu` drawer component
- A `<main>` area where page content renders via `<Outlet />`

`HamburgerMenu` uses DaisyUI's `drawer` component:
- Menu items: Dashboard (Today), My Body, My Sports, Profile, Logout
- Current page highlighted using `useLocation()` match
- On mobile: slide-out drawer triggered by hamburger icon
- Logout calls `signOut(auth)` and navigates to `/login`

Route structure in `App.tsx`:
```
/login          → LoginPage
/register       → RegisterPage
/forgot-password → ForgotPasswordPage

/ (ProtectedRoute + AppLayout)
  /dashboard    → DashboardPage
  /profile      → ProfilePage
  /setup/daily  → DailyDataSetupPage
  /setup/outcomes → OutcomesSetupPage
  /track/body   → TrackBodyPage
  /track/body/:metricId → MetricDetailPage
  /track/outcomes → TrackOutcomesPage
  /admin        → AdminPage (admin-only)
```

Default redirect: `/` → `/dashboard`.

---

### Profile setup

**Summary**: Build the profile page where users set their sport, weight, age, and gender, and access the two setup paths (daily data, outcomes). Includes Firestore profile CRUD and the "at least one setup completed" gate.

**Files affected**:
- `src/pages/ProfilePage.tsx` — Profile form + setup path cards
- `src/services/profile.ts` — Profile Firestore read/write with schema version
- `src/migrations/profile.ts` — Profile migration stub (v1)
- `src/types/profile.ts` — Profile type definition

**Estimated diff size**: ~300 lines

**Details**:

`Profile` type:
```ts
interface Profile {
  schemaVersion: number;
  username: string;
  sport: Sport;
  weight: number; // lbs
  age: number;
  gender: "unspecified" | "male" | "female" | "nonbinary";
  dailySetupComplete: boolean;
  outcomesSetupComplete: boolean;
}
```

`ProfilePage` has two sections:
1. **Profile form** — sport dropdown (6 options), weight/age numeric inputs, gender dropdown. Saves on submit.
2. **Setup paths** — two cards: "Setup Your Daily Data" and "Setup Your Outcomes Data", each linking to their setup page. Shows a checkmark if already completed. A notice if neither is complete: "Complete at least one setup to start tracking."

The `ProtectedRoute` checks `profile.dailySetupComplete || profile.outcomesSetupComplete` before allowing access to tracking pages. If neither is done, it redirects to `/profile`.

Profile is stored at `users/{uid}/profile/main` in Firestore.

---

### Sport-to-metric defaults and metric definitions

**Summary**: Seed the Firestore config collection with sport-to-metric mappings, common daily metrics, and metric definitions (input types, units, min/max ranges). This data drives the setup checklists and tracking screens. Includes a seeding script for the emulator.

**Files affected**:
- `src/types/metrics.ts` — Metric and sport mapping type definitions
- `src/services/metrics.ts` — Read metric definitions and sport defaults from Firestore config
- `src/data/defaultMetrics.ts` — Default metric definitions (all 17 daily + sport-specific)
- `src/data/sportDefaults.ts` — Sport-to-metric mapping table (6 sports)
- `scripts/seed-config.ts` — Script to seed Firestore (emulator or production) with defaults

**Estimated diff size**: ~400 lines

**Details**:

`MetricDefinition` type:
```ts
interface MetricDefinition {
  id: string;
  name: string;
  unit: string;
  inputType: "numeric" | "color-scale" | "scale-1-5" | "binary" | "scale-1-10";
  category: "body" | "training" | "outcome";
  min?: number;
  max?: number;
  description: string;
  learnMoreUrl?: string;
  schemaVersion: number;
}
```

`SportDefaults` type:
```ts
interface SportDefaults {
  sport: Sport;
  defaultBodyMetrics: string[];    // metric IDs on by default
  defaultTrainingMetrics: string[];
  defaultOutcomeMetrics: string[];
  schemaVersion: number;
}
```

Built-in metric validation ranges:
- Hydration: 1-8 (color scale)
- Sleep Time: 0-24 hours
- Sleep Efficiency: 0-100%
- Mood: 1-5
- Fatigue: 1-5
- Protein: 0-500g
- Resting Heart Rate: 20-250 bpm
- Weight metrics (Deadlift, Bench, Squat, Weight Lifted): 0-2000 lbs
- Reps: 0-1000
- Time: 0-3600 sec
- Distance: 0-100 mi

Config is stored in `config/metrics` and `config/sports/{sportId}` in Firestore. The seed script writes these defaults and is run as part of emulator setup (`npm run seed`).

---

### Daily data setup

**Summary**: Build the checklist page where users select which daily body metrics to track. Pre-checks sport defaults, shows off-by-default metrics in a collapsed section, and supports adding custom measurements. Marks `dailySetupComplete` on the profile when saved.

**Files affected**:
- `src/pages/DailyDataSetupPage.tsx` — Metric checklist with sport defaults and collapsed "Additional" section
- `src/components/MetricChecklist.tsx` — Reusable checklist component with search/filter
- `src/components/AddMeasurementModal.tsx` — Modal for creating custom metrics
- `src/services/userMetrics.ts` — Save user's selected metrics to Firestore

**Estimated diff size**: ~400 lines

**Details**:

On load:
1. Fetch sport defaults for the user's sport from `config/sports/{sport}`
2. Fetch all available metric definitions from `config/metrics`
3. Pre-check the on-by-default metrics

Layout:
- **Default metrics section** (expanded): sport-specific defaults pre-checked, each with name and unit
- **Additional Metrics section** (collapsed via DaisyUI `collapse`): off-by-default metrics with checkboxes
- **"Add Measurement" button**: opens `AddMeasurementModal`

`AddMeasurementModal` fields:
- Name (text, required)
- Unit (text, required)
- Input type (select: numeric, scale 1-10, binary)
- Date tracking (toggle: daily vs. specific dates)
- Min/Max range (optional numeric fields)

On save:
1. Write selected metric IDs to `users/{uid}/config/dailyMetrics`
2. Write any custom metrics to `users/{uid}/customMetrics/{id}`
3. Update profile: `dailySetupComplete = true`
4. Navigate to `/profile` or `/dashboard`

---

### Outcomes data setup

**Summary**: Build the outcomes setup page — similar to daily data setup but for sport-specific outcome metrics (wins/losses, goals, assists, etc.). Marks `outcomesSetupComplete` on the profile.

**Files affected**:
- `src/pages/OutcomesSetupPage.tsx` — Outcome metric checklist
- `src/services/userOutcomes.ts` — Save user's selected outcome metrics

**Estimated diff size**: ~200 lines

**Details**:

Same pattern as daily data setup but using outcome metrics from the sport defaults. Football and Track & Field show notes about position/event-dependent relevance. Users can deselect irrelevant outcomes.

On save:
1. Write selected outcome metric IDs to `users/{uid}/config/outcomeMetrics`
2. Update profile: `outcomesSetupComplete = true`

---

### Dashboard (Today)

**Summary**: Build the main dashboard with the motivational message, daily progress indicator, quick entry buttons, and the My Body / My Sport chart sections. This is the primary screen users see after login.

**Files affected**:
- `src/pages/DashboardPage.tsx` — Dashboard layout and data orchestration
- `src/components/ProgressIndicator.tsx` — "X of Y metrics logged today" bar
- `src/components/QuickEntryButton.tsx` — Button for each unlogged metric
- `src/components/QuickEntryModal.tsx` — Single-metric input modal
- `src/components/MotivationalMessage.tsx` — Streak/behavior-triggered message
- `src/components/DashboardChart.tsx` — Selectable metric chart (body and sport sections)
- `src/services/motivationalMessages.ts` — Fetch messages and evaluate trigger rules
- `src/services/streaks.ts` — Streak calculation logic

**Estimated diff size**: ~500 lines

**Details**:

Dashboard layout (top to bottom):
1. **Motivational message** — fetches from `config/messages`, evaluates rules against user's data (streak length, thresholds met), displays the first matching message with `{name}` replaced by username
2. **Progress indicator** — counts today's entries vs. user's tracked metric count; DaisyUI `progress` bar with "3 of 8 metrics logged today" text
3. **Quick entry buttons** — one per unlogged metric (e.g., "Enter Hydration"), uses DaisyUI `btn btn-outline`. Clicking opens `QuickEntryModal` with the appropriate input type for that metric. On save, button disappears (metric logged)
4. **My Body section** — dropdown to select a body metric, Chart.js line chart showing last 14 days with goal line. Default: Hydration
5. **My Sport section** — dropdown to select an outcome metric, Chart.js bar or line chart

**Empty state**: "Welcome! Start by logging today's metrics" with a CTA button to Track Data: My Body.

`streaks.ts` calculates current streak:
- Query entries by date descending
- Count consecutive calendar days (user's local timezone) with at least one entry
- Backfilled days count

---

### Track Data: My Body

**Summary**: Build the body metrics tracking screen with the data entry table (sparklines, metric names, value inputs), date navigation, input validation, edit/delete, and tags. This is the core data entry experience.

**Files affected**:
- `src/pages/TrackBodyPage.tsx` — Page layout with date nav and metric table
- `src/components/DateNavigation.tsx` — Date picker (no future dates, today indicator)
- `src/components/MetricInputRow.tsx` — Table row: sparkline | metric name | value input
- `src/components/inputs/HydrationInput.tsx` — Color block input (1-8) with numeric labels and ARIA
- `src/components/inputs/ScaleInput.tsx` — Numeric 1-5 scale with ARIA labels
- `src/components/inputs/NumericInput.tsx` — Standard numeric input with min/max validation
- `src/components/inputs/BinaryInput.tsx` — Checkbox input (Availability)
- `src/components/SparklineChart.tsx` — 14-day trend mini Chart.js line
- `src/components/TagInput.tsx` — Tag/descriptor input for qualifying entries
- `src/services/bodyEntries.ts` — Body entry CRUD (create, read, update, delete)
- `src/components/ExportButton.tsx` — CSV export for body metrics

**Estimated diff size**: ~600 lines (may split across two commits)

**Details**:

`DateNavigation` component:
- Shows current date with left/right arrows
- "Today" button to jump back to today
- Right arrow disabled when viewing today (no future dates)
- Today's date has a visual indicator (DaisyUI `badge` or highlighted border)

Metric table: each row rendered by `MetricInputRow`:
- Column 1: `SparklineChart` — 14-day mini line chart (Chart.js with minimal config, no axes). Includes `title` attribute and sr-only text ("Hydration: trending up, 5.2 avg"). Shows "Not enough data" if < 3 entries
- Column 2: Metric name (clickable → navigates to `/track/body/{metricId}` detail)
- Column 3: Input component based on `inputType` — `HydrationInput`, `ScaleInput`, `NumericInput`, or `BinaryInput`

`HydrationInput`: 8 color blocks (pale yellow → dark amber), each with a numeric label (1-8) and `aria-label` (e.g., "1 — well hydrated"). Selected block is highlighted.

`ScaleInput`: 5 buttons labeled 1-5 with `aria-label` for each (Mood: "1 — very poor" to "5 — excellent"; Fatigue: "1 — fully rested" to "5 — exhausted").

Validation: `NumericInput` checks min/max from metric definition. Out-of-range shows DaisyUI `input-error` style with inline message. Value not saved until valid.

Edit: values auto-populate when viewing a past date with existing entries. Changing a value updates the existing entry.

Delete: each row has a small delete icon (trash can) that removes the entry for that date after a DaisyUI `modal` confirmation.

Tags: optional tag input below the value field for qualifying context (e.g., "game day", "sick").

CSV export button at bottom of the page. Exports all body metric entries as CSV with columns: Date, Metric, Value, Tags.

Entry storage: `users/{uid}/bodyEntries/{date}` — a document per date containing all metric values for that day:
```ts
interface BodyEntry {
  schemaVersion: number;
  date: string; // YYYY-MM-DD
  metrics: Record<string, {
    value: number;
    tags?: string[];
    updatedAt: Timestamp;
  }>;
}
```

---

### Metric Detail Screen

**Summary**: Build the full metric detail view with description, "Learn More" link, line chart with goal line, and average value. Accessed by clicking a metric name in the tracking table.

**Files affected**:
- `src/pages/MetricDetailPage.tsx` — Metric detail layout
- `src/components/MetricLineChart.tsx` — Full Chart.js line chart with goal line and average annotation

**Estimated diff size**: ~200 lines

**Details**:

Page layout:
1. **Header**: Metric name and unit
2. **Description**: Full text from metric definition
3. **"Learn More" link**: External resource (from metric definition `learnMoreUrl`)
4. **Chart**: Chart.js line chart with:
   - X-axis: dates
   - Y-axis: appropriate to metric type (auto-scaled)
   - Data line: user's entries over the selected date range
   - Goal line: horizontal dashed line at the threshold value (from badge definitions)
   - Average line or annotation showing the computed average
5. **Date range selector**: last 7 / 14 / 30 days toggle

Uses `react-chartjs-2`'s `Line` component with `chartjs-plugin-annotation` for the goal line.

---

### Track Data: My Sports Outcomes

**Summary**: Build the outcomes tracking screen with the same date navigation as body tracking, but with outcome-specific metrics (wins/losses, points, etc.) and a Total column.

**Files affected**:
- `src/pages/TrackOutcomesPage.tsx` — Outcomes tracking table
- `src/services/outcomeEntries.ts` — Outcome entry CRUD
- `src/types/outcomes.ts` — Outcome entry type

**Estimated diff size**: ~250 lines

**Details**:

Same date navigation as Track Body (reuses `DateNavigation` component).

Table columns: Total | Metric | Value (for selected date)
- Total: running sum/count of this metric across all dates
- Metric: outcome name (e.g., "Points", "Wins/Losses")
- Value: numeric input for the selected date

Reuses `NumericInput`, edit, delete, and CSV export patterns from Track Body.

Entry storage: `users/{uid}/outcomeEntries/{date}` — same structure as body entries but for outcome metrics.

CODAP button shown at bottom, disabled with "Coming Soon" tooltip (DaisyUI `tooltip` component).

---

### Badge and threshold system

**Summary**: Implement the badge evaluation engine that checks streak and body metric thresholds, awards badges, and displays notifications. Badge definitions are read from Firestore config.

**Files affected**:
- `src/services/badges.ts` — Badge evaluation logic (streaks and thresholds)
- `src/services/badgeDefinitions.ts` — Fetch badge definitions from Firestore config
- `src/hooks/useBadgeCheck.ts` — Hook that runs badge evaluation after data entry
- `src/components/BadgeNotification.tsx` — Toast/modal showing newly earned badge
- `src/types/badges.ts` — Badge type definitions
- `src/data/defaultBadges.ts` — Default badge definitions for seeding

**Estimated diff size**: ~350 lines

**Details**:

`BadgeDefinition` type:
```ts
interface BadgeDefinition {
  id: string;
  name: string;
  type: "streak" | "threshold";
  metric?: string;           // metric ID for threshold badges
  threshold?: number;
  window?: number;            // rolling window in days
  streakDays?: number;        // for streak badges
  messageTemplate: string;    // "{name}" placeholder
  schemaVersion: number;
}
```

Badge evaluation in `badges.ts`:
- **Streak badges**: count consecutive days with entries, compare against each streak badge's `streakDays`
- **Complete Entry badge**: check if all tracked metrics have entries for today
- **Threshold badges**: query last N days of a specific metric, compute average (or consecutive days for hydration), compare against threshold. Protein badge calculates per-kg target using `profile.weight`

`useBadgeCheck` hook: runs after any entry save. Compares newly earned badges against `users/{uid}/badges/{badgeId}` (already-awarded). If new, writes the badge and triggers `BadgeNotification`.

`BadgeNotification`: DaisyUI `toast` or `modal` showing badge name, icon, and personalized message.

Earned badges stored at `users/{uid}/badges/{badgeId}`:
```ts
interface EarnedBadge {
  badgeId: string;
  earnedAt: Timestamp;
  schemaVersion: number;
}
```

---

### Admin interface

**Summary**: Build the admin-only page for managing motivational messages, sport-to-metric mappings, and badge definitions. Includes the CLI script for assigning admin roles via Firebase custom claims.

**Files affected**:
- `src/pages/AdminPage.tsx` — Admin dashboard with tabbed sections
- `src/components/admin/MessageEditor.tsx` — CRUD for motivational messages and trigger rules
- `src/components/admin/SportMappingEditor.tsx` — Edit sport-to-metric default mappings
- `src/components/admin/BadgeEditor.tsx` — Edit badge definitions and thresholds
- `src/components/admin/MetricEditor.tsx` — Edit built-in metric definitions (names, ranges, descriptions)
- `scripts/set-admin.js` — Node CLI script to set admin custom claims

**Estimated diff size**: ~500 lines

**Details**:

`AdminPage` is only accessible if `AuthContext.isAdmin` is true. Route guard in `App.tsx` redirects non-admins to `/dashboard`.

Tabbed layout (DaisyUI `tabs`):
1. **Messages** — table of motivational messages with trigger rules. Add/edit/delete. Each message has: text (with `{name}` placeholder), trigger type (streak, threshold, etc.), trigger value
2. **Sport Mappings** — per-sport tables of default metrics (body, training, outcome). Add/remove metric IDs from each sport's defaults
3. **Badges** — table of badge definitions. Edit thresholds, windows, messages. Add new badges
4. **Metrics** — table of built-in metric definitions. Edit names, descriptions, ranges, learn-more URLs

All edits write to the `config/` collection in Firestore. Changes take effect immediately for all users (no cache — config reads are not cached client-side).

`scripts/set-admin.js`:
```js
// Usage: node scripts/set-admin.js user@example.com
const admin = require("firebase-admin");
admin.initializeApp();

const email = process.argv[2];
const user = await admin.auth().getUserByEmail(email);
await admin.auth().setCustomUserClaims(user.uid, { admin: true });
console.log(`Admin claim set for ${email} (uid: ${user.uid})`);
```

Requires `firebase-admin` as a dev dependency.

---

### UX states and polish

**Summary**: Add empty states, skeleton loading, error/offline banners, and sparse data handling across all screens. This is a cross-cutting concern that touches multiple existing pages.

**Files affected**:
- `src/components/EmptyState.tsx` — Reusable empty state with message and CTA button
- `src/components/SkeletonLoader.tsx` — Skeleton placeholders (card, table row, chart)
- `src/components/OfflineBanner.tsx` — Banner shown when navigator.onLine is false
- `src/components/ErrorAlert.tsx` — Inline error alert component
- `src/pages/DashboardPage.tsx` — Add empty/loading/error states
- `src/pages/TrackBodyPage.tsx` — Add empty/loading/error states
- `src/pages/TrackOutcomesPage.tsx` — Add empty/loading/error states
- `src/pages/MetricDetailPage.tsx` — Add sparse data handling

**Estimated diff size**: ~300 lines

**Details**:

`EmptyState` — DaisyUI `card` with illustration placeholder, message text, and optional action button. Used on:
- Dashboard (no data): "Welcome! Start by logging today's metrics" → button to Track Body
- Track Body (no metrics set up): "Set up your daily metrics first" → button to Setup
- Track Outcomes (no outcomes set up): similar

`SkeletonLoader` — Tailwind `animate-pulse` divs matching the layout of cards, table rows, and chart areas. Shown while Firestore data is loading.

`OfflineBanner` — listens to `window.addEventListener("online"/"offline")`. Shows a DaisyUI `alert alert-warning` fixed at top: "You're offline. Changes will sync when you reconnect."

`ErrorAlert` — DaisyUI `alert alert-error` for operation failures (e.g., Firestore write errors). Dismissible.

Sparse data handling in charts: if fewer than 3 data points, render the points but skip the trend line. `SparklineChart` shows "Not enough data" sr-only text and a flat placeholder visual.

---

### PWA service worker and deployment

**Summary**: Configure the Vite PWA plugin for offline caching, finalize the service worker strategy, set up Firebase Hosting with a staging environment, and add deployment scripts.

**Files affected**:
- `vite.config.ts` — PWA plugin configuration with caching strategies
- `public/manifest.json` — Finalize icons and metadata
- `firebase.json` — Hosting config with caching headers
- `.firebaserc` — Staging and production project aliases
- `package.json` — Add deploy scripts (`deploy:staging`, `deploy:production`)

**Estimated diff size**: ~150 lines

**Details**:

`vite-plugin-pwa` config:
```ts
VitePWA({
  registerType: "autoUpdate",
  workbox: {
    globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
        handler: "CacheFirst",
        options: { cacheName: "google-fonts", expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
      },
    ],
  },
  manifest: false, // use public/manifest.json
})
```

Firebase Hosting:
- `.firebaserc` defines two aliases: `staging` and `production`
- `package.json` scripts:
  - `"build"`: `vite build`
  - `"deploy:staging"`: `npm run build && firebase deploy --only hosting -P staging`
  - `"deploy:production"`: `npm run build && firebase deploy --only hosting -P production`
  - `"emulators"`: `firebase emulators:start --import=./firebase-data --export-on-exit`
  - `"seed"`: `ts-node scripts/seed-config.ts`

Hosting headers in `firebase.json` for cache busting on index.html and long-lived caching on hashed assets.

---

## Open Questions

<!-- Implementation-focused questions only. Requirements questions go in requirements.md. -->

### RESOLVED: Should Firestore data be structured as subcollections or flat documents?
**Context**: Body entries could be stored as `users/{uid}/bodyEntries/{date}` (one doc per date with all metrics) or `users/{uid}/bodyEntries/{date}/metrics/{metricId}` (subcollection per metric). The flat approach is simpler and uses fewer reads but the doc could grow large if many metrics are tracked.
**Options considered**:
- A) Flat: one document per date with a `metrics` map — fewer reads, simpler queries, sufficient for the expected ~20 metrics per day
- B) Subcollection: one document per metric per date — more granular, but many more reads and writes

**Decision**: **A) Flat** — one document per date with a metrics map. Sufficient for ~20 metrics per day, fewer Firestore reads, simpler queries.

### RESOLVED: Should the app use React Context or a state management library for global state?
**Context**: The app needs to share auth state, profile data, metric definitions, and badge state across components. React Context is simple but can cause unnecessary re-renders with frequently changing data.
**Options considered**:
- A) React Context only — simpler, no extra dependency, sufficient for this app's moderate state needs
- B) Zustand — lightweight, minimal boilerplate, good devtools, avoids context re-render issues
- C) React Context + useMemo/useCallback optimization — middle ground, no extra dep

**Decision**: **A) React Context only** — simple, no extra dependency, sufficient for this prototype's moderate state needs.

### RESOLVED: How should the seeding script handle existing config data?
**Context**: The seed script writes default metrics, sport mappings, badges, and motivational messages to Firestore. If run against a Firestore instance that already has config data (e.g., after an admin has made edits), should it overwrite, merge, or skip?
**Options considered**:
- A) Skip if exists — safe, never overwrites admin edits, may miss new defaults on upgrades
- B) Merge — add new entries, don't overwrite existing ones. Allows adding new defaults without losing admin edits
- C) Overwrite with `--force` flag — default is skip, optional flag to force-reset to defaults

**Decision**: **B) Merge** — add new entries without overwriting existing ones. Preserves admin edits while allowing new defaults to be added on upgrades.
