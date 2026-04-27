# DataGOAT Prototype to React Conversion Plan

**Repo**: https://github.com/concord-consortium/datagoat
**Prototype**: https://models-resources.concord.org/demos/branch/datagoat/index.html
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

Convert the DataGOAT designer prototype (a single-page HTML / vanilla-JS mockup) into the production React 19 + Vite + Firebase app, replacing the current wireframed auth shell with the full 11-screen flow — auth, profile, tracked-data setup, dashboard, daily wellness/performance logs, metric detail, add-metric, info modals, and a CODAP plugin view. Ships in one atomic PR alongside three React contexts (Auth / User / Data), a lazy-on-read Firestore migration layer, a Cloud Function that blocks Facebook signups missing an email, the prototype's dark-theme design system, and the routing + onboarding flow. Real chart rendering and per-athlete-type Performance Log metrics are deferred to tracked follow-ups; this PR ships placeholders that pin the API and accessibility contracts so the swap is purely visual.

## Project Owner Overview

DataGOAT is a personal-data tracking app for student athletes. Users log daily wellness metrics (hydration, sleep, protein, lean mass, availability) and performance metrics (sport-specific counters), then view trends and goal comparisons on a dashboard, with an optional export to CODAP for deeper analysis. The current production deployment is a thin wireframed auth shell — there is no real product surface yet. The designer has delivered a high-fidelity HTML/JS prototype of the intended experience, and this story converts that prototype into the production app so future demos, user tests, and pilots run against the real application rather than a static mockup.

The conversion is foundation work: it lands the app shape (auth + onboarding + log + dashboard + CODAP plugin), the design system (dark theme, fonts, motion tokens, focus indicators), and the data layer (Firestore + per-document version migrations + a server-side blocking trigger that prevents orphan Facebook accounts without an email address). Two pieces are explicitly deferred to keep this PR finite: real SVG chart rendering (placeholders ship now with the full prop API and screen-reader contract pinned, plus a working visually-hidden data table so the SR experience is complete on day one) and the designer-final per-athlete-type Performance Log metric sets (a placeholder set ships via a registry that swaps in one file when the designer commits). Both are tracked in **Deferred Work** with explicit closing-epic acceptance criteria — every deferred item must be filed as a tracked Jira ticket before the parent epic closes. The conversion ships as a single atomic PR rather than phased increments because partial conversions in `main` are a worse review burden than the full bundle, and per-step commits keep individual diffs reviewable inside the PR.

## Prototype Summary

The designer's prototype is a single-page HTML file with 11 screens inside a phone mockup shell. It uses vanilla JS for screen switching, mock data arrays on `window`, and custom SVG charts. The phone shell, scenario switcher, and device switcher are prototype-only UI and should be stripped.

## Screens Identified

| Screen ID | Purpose | Key Content |
|---|---|---|
| auth-shell | Login / Signup / Forgot / Verify | Social sign-in buttons (Google, Facebook) + email/password forms, forgot flow, email verification (non-blocking) |
| profile-screen | Profile setup (onboarding + edit) | Name, email, password, nickname, age, height, weight, gender, athlete type, competition term |
| tracked-data-screen | Select which metrics to track | Two tables (Health & Wellness + Performance) with checkboxes, add-metric buttons. Has an edit-mode toggle that reveals per-row delete buttons and enables drag-and-drop reordering of tracked metrics. |
| dashboard-screen | Home / summary view | Dashboard header slides between wordmark and a streak/motivation message (7 rotating messages, name-substituted). Section calendars (heatmap-style: All / Some / None / inactive) for Health & Wellness and Performance activity. **Health & Wellness calendar cells are interactive**: tapping/clicking (or pressing Enter/Space on focus) a non-inactive day navigates to the Health & Wellness Log on that date. Log-status buttons ("Log your X metrics for today") linking to each log screen. Two chart cards (Health & Wellness + Performance) with metric dropdown and time-range picker: 1w / 2w / 30d / 3mo / 6mo / All. "Analyze Your Data in CODAP" button. |
| wellness-log-screen | Daily Health & Wellness data entry | Date nav with **dynamic completeness chip** + legend ("Data entered: All / Some / None"); table with inputs (hydration 1-8, sleep hours, sleep %, protein, lean mass, availability radios). Screen label is "Health & Wellness Log"; route remains `/wellness`. |
| performance-log-screen | Daily performance data entry | Date nav (label-only, no chip/legend), table with inputs (wins/losses, goals, assists, yards, tackles), running totals column. Prototype still in flux per designer note — set of metrics per athlete type is not final. |
| metric-detail-screen | Deep dive on one metric | Dynamic chart (line or bar), metric info, goal/avg lines |
| add-metric-screen | Browse + add new metrics | Scrollable metric list with descriptions and add buttons |
| athlete-type-info-screen | Info modal | Explains Endurance vs Strength/Power |
| gender-info-screen | Info modal | Explains gender selection impact on goals |
| comp-term-info-screen | Info modal | Defines competition terms (Bout, Game, Match, etc.) |

## What to Strip (Prototype-Only)

- `.prototype-shell` - outer wrapper
- `.scenario-switcher` - left panel with Login/Signup toggle + autofill checkboxes
- `.device-switcher` - right panel device selector
- `.status-bar` - iOS/Android status bar mockup
- `.ios-chrome-bottom`, `.android-chrome-bottom`, `.samsung-internet-bottom` - browser UI mocks
- `.phone.ios-chrome.has-dynamic-island` - phone frame (replace with existing app container)
- All `window._*` global data structures (move to React state/context)

## Proposed Component Structure

```
src/
  components/
    layout/
      AppHeader.tsx              - DataGOAT wordmark + tagline
      AppHeader.module.css
      HamburgerMenu.tsx          - slide-out nav overlay
      HamburgerMenu.module.css
      SectionHeading.tsx         - sticky heading with back/home/menu buttons
      SectionHeading.module.css
      DateNav.tsx                - prev/next date navigation; supports an optional "with-legend" variant (chip + label center, plus a "Data entered: All / Some / None" legend row) used by Health & Wellness Log. The chip uses **color + shape** to encode state (All = solid filled square, Some = filled square with diagonal stripe overlay, None = empty square with border) so deuteranopic / protanopic users have a non-color cue. Reads the current date from `useSearchParams()` (`?date=YYYY-MM-DD`); prev/next mutates the search param. Direct navigation to `/wellness` (no `?date=...`) falls back to today.
      DateNav.module.css

    auth/
      LoginForm.tsx              - "Continue with Google" + "Continue with Facebook" social buttons + "or" divider, then email + password + forgot link; password field has show/hide eye toggle
      LoginForm.module.css
      SignupForm.tsx              - "Continue with Google" + "Continue with Facebook" social buttons + "or sign up with email" divider, then email + password create-account form; calls sendEmailVerification() after email/password registration (skipped for OAuth)
      SignupForm.module.css
      ForgotPassword.tsx          - email input, send reset link
      ForgotPassword.module.css
      EmailVerification.tsx       - "check your email" screen shown after signup, resend link button
      EmailVerification.module.css
      VerificationBanner.tsx      - dismissible reminder banner shown after 7 days if still unverified
      VerificationBanner.module.css

    profile/
      ProfileForm.tsx             - full profile form (name, age, height, weight, gender, athlete type, comp term)
      ProfileForm.module.css

    tracking/
      TrackedDataSetup.tsx        - wellness + performance metric selection tables
      TrackedDataSetup.module.css
      AddMetric.tsx               - browse/add new metrics
      AddMetric.module.css

    dashboard/
      Dashboard.tsx               - main dashboard layout
      Dashboard.module.css
      DashboardHeaderSlide.tsx    - slides between wordmark and streak/motivation message
      DashboardHeaderSlide.module.css
      MotivationMessage.tsx       - rotating motivation carousel (7 messages, name-substituted)
      MotivationMessage.module.css
      ActivityCalendar.tsx        - section calendar (heatmap All/Some/None/inactive) for Health & Wellness + Performance. Health & Wellness cells are tappable (`role="button"`, `tabindex="0"`, Enter/Space activates) when **both** filters pass: (a) `state !== inactive`, and (b) the cell's calculated date offset is in `[0, HISTORY]` (not before the first tracked day, not in the future). Cells outside the active window render as inactive (no hover/focus indicator, no `tabindex`, no `role="button"`, click is a no-op). Tappable cells navigate to `/wellness?date=YYYY-MM-DD` via `<Link>`. Performance cells remain non-interactive in this story.
      ActivityCalendar.module.css
      DashLogHeader.tsx           - "Log your X metrics for today" CTA linking to each log screen
      DashLogHeader.module.css
      TimeRangePicker.tsx         - 1w / 2w / 30d / 3mo / 6mo / All pill picker for charts
      TimeRangePicker.module.css
      CodapButton.tsx             - "Analyze Your Data in CODAP" button (desktop-only behavior)
      CodapButton.module.css
      MetricSummary.tsx           - wellness/performance averages display
      MetricSummary.module.css

    logs/
      WellnessLog.tsx             - wellness data entry table
      WellnessLog.module.css
      PerformanceLog.tsx          - performance data entry table
      PerformanceLog.module.css
      MetricInput.tsx             - single metric input row (numeric, radio, etc.)
      MetricInput.module.css

    charts/
      MetricChart.tsx             - line/bar chart for body + performance metrics
      MetricChart.module.css
      MetricDetail.tsx            - full metric detail view with chart
      MetricDetail.module.css

    info/
      InfoScreen.tsx              - reusable info modal (athlete type, gender, comp term)
      InfoScreen.module.css

    form/
      TextField.tsx               - labeled text/email/password input
      TextField.module.css
      SelectField.tsx             - labeled dropdown
      SelectField.module.css
      RadioGroup.tsx              - radio button group (availability)
      RadioGroup.module.css

    common.module.css             - shared layout styles (existing)
```

## React Context

Three contexts to avoid prop drilling:

### AuthContext (already partially exists)
```ts
interface AuthState {
  user: User | null;
  loading: boolean;
  isNewUser: boolean;        // controls onboarding flow (locks nav to profile -> tracked data -> dashboard)
  isEmailVerified: boolean;  // from user.emailVerified
  daysUnverified: number;    // calculated from user.metadata.creationTime; drives the verification banner
}
```

#### Email verification flow
- **Non-blocking**: users enter the app immediately after registration, no gate
- `sendEmailVerification(user)` is called right after `createUserWithEmailAndPassword()`
- After signup, the user sees the `EmailVerification` screen ("We sent a verification link to {email}") with a "Continue" button and a "Resend Link" button
- Once in the app, `VerificationBanner` shows a dismissible reminder if `!isEmailVerified && daysUnverified >= 7`
- `daysUnverified` is calculated from `user.metadata.creationTime` vs current date
- **OAuth users (Google + Facebook) skip this entirely** when `user.emailVerified` is already `true` from the provider - `sendEmailVerification` is not called and the banner never shows. The check is provider-agnostic: any sign-in path that yields `user.emailVerified === true` opts out. Facebook does not always return a verified email; if `user.emailVerified` is `false` after Facebook sign-in, the same email/password verification flow applies (send + EmailVerification screen + banner)

### UserContext
```ts
interface UserProfile {
  version: number;   // persisted to Firestore, enables future data migrations
  fullName: string;
  email: string;
  nickname: string;
  age: number;
  heightFt: number;
  heightIn: number;
  weight: number;   // pounds (prototype displays "Lbs")
  gender: 'male' | 'female' | 'non-binary' | 'unspecified';
  athleteType: 'endurance' | 'strength';   // UI label for 'strength' is "Strength and Power"
  competitionTerm: string;
  trackedWellnessMetrics: string[];    // which metrics the user tracks
  trackedPerformanceMetrics: string[];
  profileComplete: boolean;
  trackingSetupComplete: boolean;
}
```
Persisted in Firestore at `users/{uid}/profile`. The `gender + athleteType` combo determines goal values for charts (the prototype has `_profileVariants` keyed like `male-endurance`).

#### Profile load state and ProtectedRoute

The profile is fetched async from Firestore after sign-in. Consumers and route guards must distinguish "still fetching" from "fetched, no doc exists" (new user). `UserContext` exposes a tri-state load value:

```ts
type ProfileLoadState =
  | { status: 'loading' }
  | { status: 'missing' }                         // fetch resolved, no Firestore doc -> new user
  | { status: 'loaded'; profile: UserProfile };
```

`ProtectedRoute` behavior:
- `status === 'loading'` -> render `<Loading />`. **Never redirect while loading**, or returning users will be kicked back to `/profile` on every cold start.
- `status === 'missing'` -> redirect to `/profile` (onboarding entry point).
- `status === 'loaded'` -> render the child route.

A route that is itself part of onboarding (`/profile`, `/setup/tracking`) only gates on `status !== 'loading'` - it renders regardless of whether the doc exists, because that's where new users land and where existing users edit.

### DataContext
```ts
interface DataState {
  wellnessData: WellnessEntry[];      // daily wellness logs
  performanceData: PerformanceEntry[];  // daily performance logs
  currentWellnessOffset: number;       // date navigation offset (0 = today)
  currentPerformanceOffset: number;
}

interface WellnessEntry {
  version: number;   // persisted to Firestore, enables future data migrations
  date: string;
  hydration: number;       // 1-8
  sleepTime: number;       // hours
  sleepEfficiency: number; // %
  protein: number;         // g/kg/day
  leanMass: number;        // kg
  availability: {
    // Prototype uses a nested yes/no tree (not full/limited):
    //   "Did you have practice today? Y/N"  -> if Y, "Did you participate? Y/N"
    //   "Did you have a game today? Y/N"    -> if Y, "Did you participate? Y/N"
    // Sub-value `played` means participated; `dnp` means "did not play".
    practiceHeld: boolean | null;
    practiceParticipation: 'played' | 'dnp' | null;   // null when practiceHeld is false/null
    gameHeld: boolean | null;
    gameParticipation: 'played' | 'dnp' | null;       // null when gameHeld is false/null
  };
}

interface PerformanceEntry {
  version: number;   // persisted to Firestore, enables future data migrations
  date: string;
  metrics: Record<string, number | string>;  // dynamic bag, keyed by tracked metric id
}
```
Persisted in Firestore at `users/{uid}/wellnessEntries/{date}` and `users/{uid}/performanceEntries/{date}`.

#### Data load state

The same Firestore-fetch race that affects `UserContext` (see Profile load state above) applies here. The distinction: unlike a missing profile, "no entries" is a legitimate loaded state (new user, gap day), not an error. So `DataContext` uses a **bi-state** instead of a tri-state:

```ts
type DataLoadState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; entries: T[] };
```

Rule:
- `status === 'loading'` -> consumers (Dashboard, WellnessLog, PerformanceLog, MetricDetail) render a skeleton or spinner. **Never** render empty state, "no data logged," or zero-value chart axes during loading - it flashes wrong.
- `status === 'loaded'` -> render the UI normally; if `entries.length === 0`, now is when the empty-state copy appears ("No entries logged for today").

Each data kind (wellness, performance) has its own `DataLoadState` so partial loads render as fast as possible without waiting for the slower fetch.

## Integration with existing code

Firebase Auth is already wired up in the repo. The conversion preserves the working auth logic and replaces only the UI layer. This section inventories what's in the repo today so the auth conversion commit (Implementation Order step 2) doesn't accidentally reinvent working code.

### Files in the repo today

- [src/firebase.ts](src/firebase.ts) - initializes Firebase app, exports `auth`, connects to the Auth emulator when `VITE_USE_EMULATORS=true`
- [src/App.tsx](src/App.tsx) - subscribes to `onAuthStateChanged`, renders one of `Loading` / `Login` / `Authed` based on auth state, manages a `registeredDisplayName` bridge for the post-registration race (see below)
- [src/components/Login.tsx](src/components/Login.tsx) + [Login.module.css](src/components/Login.module.css) - single-form login/register UI with Google OAuth, email/password sign-in, account creation, `updateProfile({ displayName })`, and error-code -> user-message mapping
- [src/components/Authed.tsx](src/components/Authed.tsx) + [Authed.module.css](src/components/Authed.module.css) - placeholder authenticated view (wordmark + display name + email + Logout button)
- [src/components/Logout.tsx](src/components/Logout.tsx) + [Logout.module.css](src/components/Logout.module.css) - sign-out button
- [src/components/Loading.tsx](src/components/Loading.tsx) + [Loading.module.css](src/components/Loading.module.css) - loading screen
- [src/components/common.module.css](src/components/common.module.css) - shared `.centered` / `.title` layout rules

### Preserve (carry forward unchanged or with minimal edits)

- **Auth handler calls**: `signInWithPopup(auth, googleProvider)`, `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `updateProfile(user, { displayName })`, `signOut` - these already work and should not be re-derived. Facebook is added alongside Google as a second OAuth provider (see Add section below).
- **Error-code -> message mapping** (`authErrorMessages` in Login.tsx) - extend with any new codes surfaced by Forgot Password and resend-verification flows; do not rewrite.
- **`registeredDisplayName` bridging pattern in App.tsx** - `onAuthStateChanged` fires before `updateProfile` completes during registration, so the user object arrives without a `displayName`. App.tsx keeps a local state value and passes it into `Authed` as a fallback. This pattern must be preserved when App.tsx is restructured around the new router/contexts.
- **`onAuthStateChanged` subscription** - stays at the app root; feeds `AuthContext`.
- **Firebase emulator wiring in `firebase.ts`** - extend to also call `connectFirestoreEmulator` when Firestore is added.
- **CSS Modules convention** (`import css from "./X.module.css"`, scoped class names) - already established and aligned with the prototype's structure. New `auth/` components follow this convention.

### Rewrite

- **Auth UI structure**: the current single-form `Login.tsx` becomes separate screens under `src/components/auth/`: `LoginForm`, `SignupForm`, `ForgotPassword`, `EmailVerification`, `VerificationBanner`. Each screen is a route (`/login`, `/signup`, `/forgot-password`, `/verify-email`).
- **Styling**: light-theme colors across [Login.module.css](src/components/Login.module.css), [Authed.module.css](src/components/Authed.module.css), [Logout.module.css](src/components/Logout.module.css), [common.module.css](src/components/common.module.css), [index.css](src/index.css), and [App.module.css](src/App.module.css) are discarded. Rewrite against the prototype's dark-theme CSS variables (source of truth per the Decisions section). The mobile-container wrapper in `index.css` + `App.module.css` keeps its structural rules (max-width, height tiers, landscape collapse, `tabIndex` focus outline) but drops its visible surround (body background differentiation, column border, drop shadow, white column background) — see "App infrastructure to preserve" for the full structure-vs-surround split.
- **Placeholder Authed view**: `Authed.tsx` is replaced by the real routed app shell (AppHeader, HamburgerMenu, onboarding gate, dashboard). The display-name fallback logic moves into whatever component consumes `AuthContext.user.displayName`.
- **Inline SVGs for Google icon, email icon, user icon** in `Login.tsx` - drop in favor of the icon strategy described under Design System / CSS → Iconography. Brand marks (Google, Facebook, DataGOAT) are URL imports rendered as `<img>`; theme-aware glyphs (email, user, info, etc.) are imported as React components via `vite-plugin-svgr` from `src/icons/`. Facebook's logo is added as a sibling brand-mark asset under `public/icons/` (the prototype references `icons/facebook-logo.svg`).

### Add (new to the React app)

- `sendEmailVerification(user)` call immediately after `createUserWithEmailAndPassword`. The signup succeeds even if the verification send fails, but the error is **not silently swallowed**: it is logged (`console.error` for now, behind a `logError` helper so a telemetry hook can be added later) and its failure state is passed into the `EmailVerification` screen so the user sees a clear "couldn't send" note, not an empty wait.
- `EmailVerification` screen shown after signup: "We sent a verification link to {email}" on the happy path, or "We had trouble sending the email - tap Resend to try again" when the initial send failed. Resend Link button is always visible (not gated on failure) and calls `sendEmailVerification` again. Continue button advances into the app regardless (verification is non-blocking).
- `VerificationBanner` dismissible banner shown inside the app when `!user.emailVerified && daysUnverified >= 7`.
- `sendPasswordResetEmail(auth, email)` for the Forgot Password flow. Success copy is **deliberately neutral on account existence**: *"If an account exists for that email, we sent a reset link. Check your inbox."* - shown whether or not the email is registered. This matches Firebase Auth's server-side behavior and avoids user enumeration. Do not display the email address back to the user or any variation of "Sent to you@school.edu."
- Password show/hide eye-toggle button (`.eye-btn` from the prototype) on password fields.
- `AuthContext` - wraps `useState(user)` + `onAuthStateChanged`, derives `isNewUser` (no Firestore profile yet), `isEmailVerified`, `daysUnverified`. Provides a `signOut` helper.
- **Facebook OAuth provider** alongside Google: `signInWithPopup(auth, facebookProvider)` using `FacebookAuthProvider` from `firebase/auth`. Wired identically to Google in both `LoginForm` and `SignupForm` - both screens render two social buttons ("Continue with Google", "Continue with Facebook") above the email/password form, separated by an `or` / `or sign up with email` divider. Popup-flow rejections (`auth/popup-blocked`, `auth/popup-closed-by-user`, `auth/cancelled-popup-request`, `auth/network-request-failed`) route through `logError` for consistency with the rest of the auth flows; `auth/popup-closed-by-user` is a normal user action and should log at debug level (or be filtered upstream when a real telemetry client lands).
- **Inline account-linking flow** when `auth/account-exists-with-different-credential` fires (a Facebook user whose email is already registered under another provider). The LoginForm / SignupForm catches the error, calls `fetchSignInMethodsForEmail(email)` to determine the existing provider, extracts the pending Facebook credential via `FacebookAuthProvider.credentialFromError(error)`, and flips the screen to a linking-mode view (component-local state — no separate route). The linking view tells the user "This email is registered with [Google / email]. Sign in to link Facebook to your account." and renders either a "Continue with Google" button (existing method = `google.com`) or an email + password form with the email locked (existing method = `password`). On successful sign-in with the existing provider, `linkWithCredential(result.user, pendingCredential)` is called (using the user from the just-resolved sign-in promise — not `auth.currentUser` — so the linkage is scoped to the user that authenticated for this flow and isn't subject to cross-tab races) and the user is navigated to `/dashboard` with both providers linked. The pending credential is held in component-local state — refreshing during the flow restarts it. Profile-screen "Linked Accounts" management UI is **out of scope** (sign-in-time linking only). Reference: https://firebase.google.com/docs/auth/web/account-linking.
- **Facebook missing-email handled server-side** via a Firebase **`beforeUserCreated` Cloud Function blocking trigger**. Facebook lets users deny the `email` scope, in which case `user.email` is `null`. Rather than detecting this client-side and routing to a fallback screen, the blocking function rejects the auth attempt before the user record is created — throwing `HttpsError('invalid-argument', '[BLOCKED_NO_EMAIL] Your Facebook account does not share an email address with us. Either share your email with Facebook, or sign up with a different method.')` when the provider data includes `facebook.com` and `event.data.email` is absent. The `[BLOCKED_NO_EMAIL]` prefix is a stable sentinel that survives copy edits and Firebase SDK wrapping changes; the client receives `auth/internal-error`, matches on the sentinel substring, strips it, and renders the remainder as the inline error. The Cloud Function is the **single source of truth for the user-facing copy** — there is no `blocked-no-email` entry in `authErrorMessages` (would duplicate the message and create a copy-drift surface). See the Implementation Spec's Cloud Functions step for the sentinel rationale. No client-side null-email check, no orphaned `null`-email user records, no manual-email fallback UI. **Prerequisite**: the Firebase project must be upgraded from "Firebase Auth" to "Identity Platform" (a one-time admin action — Auth → Settings → "Upgrade to Identity Platform"; free tier through 50K MAU). Without the upgrade, blocking triggers fail to deploy. The function lives under `functions/src/auth/blockFacebookMissingEmail.ts` and is unit-tested + emulator-tested. See the Implementation Spec for the full Cloud Functions step.
- Errors from OAuth flows map through the existing `authErrorMessages` table; extend with at minimum: `auth/popup-blocked`, `auth/popup-closed-by-user`, `auth/cancelled-popup-request`, plus the synthetic `blocked-no-email` entry described above. The `auth/account-exists-with-different-credential` case is **not** mapped to a generic error message — it triggers the inline linking flow described above.
- **OAuth verification short-circuit**: skip `sendEmailVerification` and the verification banner whenever `user.emailVerified === true` after sign-in, regardless of provider. This covers Google reliably and Facebook conditionally (Facebook's `emailVerified` depends on the user's FB account state). Do not key off `providerData[0]?.providerId` - keying off `emailVerified` is correct for both providers and any future ones.
- `logError` helper at [src/utils/logError.ts](src/utils/logError.ts) with signature `(err: unknown, context?: Record<string, unknown>) => void`. Body for this commit is a single `console.error(err, context)` call. A comment marks the seam for a future telemetry client: `// TODO: wire to telemetry (Sentry/Rollbar) when a client is added`. This helper is the target for every non-fatal error in the auth flows (`sendEmailVerification` failure, `sendPasswordResetEmail` failure, etc.) so swapping in real telemetry later is a one-file change.

### App infrastructure to preserve

Beyond auth, the repo has shipped infrastructure that the conversion must preserve or extend rather than re-derive.

- **PWA / service worker** (**preserve**): [vite.config.ts](vite.config.ts) registers `VitePWA` with NetworkFirst for HTML navigation and precached static assets; [src/main.tsx](src/main.tsx) warms the "pages" runtime cache on first visit, checks for SW updates on `visibilitychange`, and auto-reloads when a new SW takes control; [firebase.json](firebase.json) enforces `Cache-Control: no-store` for `sw.js` / `registerSW.js` and `no-cache` for `/index.html`, with long immutable caching for `/assets/**`. This is the "deploys visible immediately" strategy and must survive the restructure. The CODAP plugin view continues to skip SW registration (already in the spec).
- **Responsive mobile container** (**preserve structure, drop visible surround, narrow column to match prototype**): [src/index.css](src/index.css) and [App.module.css](src/App.module.css) shipped a three-tier 640px-capped layout under DGT-6 *with* a visible "floating card" surround (light body background, 1px column border, drop shadow, white column). The structure is kept; the visible surround is dropped because the dark-theme app reads better as a uniform background with a max-width content constraint than as a card floating on a surround. The column max-width is also **narrowed from 640px to 440px** to match the prototype: the designer's "Desktop / Tablet" preview mode is `data-w="440"` and the largest phone option is 440×956, so 440px is the widest the prototype was ever rendered. The 640px cap was a DGT-6-era guess; 440px is now the source of truth. Specifically:
  - **Keep (structural)**: 440px `max-width` on the column (down from 640px); two-tier height (`< 1024px` `100dvh`, `>= 1024px` `95dvh` centered as a content-proportion guardrail) — the previous 640px height-tier breakpoint is dropped because it only existed to toggle the column border/shadow, and those are gone; landscape-phone collapse via `@media (pointer: coarse) and (orientation: landscape) and (max-height: 500px)`; global `*, *::before, *::after { box-sizing: border-box }` reset; `100vh` / `100dvh` fallbacks; `tabIndex={0}` on `<main>` for keyboard scroll.
  - **Drop (visible surround)**: body background `#eef2f6` (set to `var(--bg)` so body and column share one dark color); column `border: 1px solid #d6dde3`; column `box-shadow`; explicit column `background: #ffffff`.
  - **Swap (focus indicator)**: `<main>`'s `:focus-visible` outline changes from `#0693e3` (light-theme blue) to `var(--focus-ring)` (`#4D9FFF`). With no visible column edges, this outline becomes the only cue that the scroll container has focus — important for keyboard users.
  - CODAP plugin view bypasses this container entirely (already in the spec).
- **Keyboard-scroll focus** (**preserve**): [App.tsx](src/App.tsx) renders `<main tabIndex={0}>` and [App.module.css](src/App.module.css) applies a `:focus-visible` outline. This is the DGT-6 a11y affordance that lets keyboard users focus the scroll container and use arrow keys / PgUp / PgDn / Home / End. The new app shell must keep `tabIndex={0}` on whatever element owns the scroll.
- **Firestore security rules** (**preserve, extend cautiously**): [firestore.rules](firestore.rules) grants `read, write` on `/users/{userId}/**` to the owning user, and `/config/**` is admin-only. All DataContext paths proposed in this spec (`users/{uid}/profile`, `users/{uid}/wellnessEntries/{date}`, `users/{uid}/performanceEntries/{date}`) fall under the existing rule - no rule changes are needed for this story. Do not add new top-level collections without a paired rule change.
- **Firebase emulator wiring** (**extend**): [src/firebase.ts](src/firebase.ts) calls `connectAuthEmulator(auth, "http://localhost:9099")` when `VITE_USE_EMULATORS=true`. Adding Firestore to the same file requires a parallel `connectFirestoreEmulator(db, "localhost", 8080)` call guarded by the same flag. Emulator ports are already defined in [firebase.json](firebase.json) (Auth 9099, Firestore 8080, Hosting 5000).
- **Firebase config via `VITE_*` env vars** (**preserve**): [firebase.ts](src/firebase.ts) reads `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` from Vite's env. [.env.example](.env.example) is the template; `.env.local` supplies real values. No new env vars needed for this story.
- **Version display** (**relocate**): the sticky-bottom footer in [App.tsx](src/App.tsx) / [App.module.css](src/App.module.css) is **removed**. The prototype has no equivalent, and it competes with the dashboard log CTAs + CODAP button for scarce mobile vertical space. Version info is still needed for PWA debugging (users reporting "my app is stale" need to be able to read their build), so it moves to the **About screen**. `APP_VERSION` and `APP_VERSION_DESC` constants stay in code (bumped for this commit), but they are rendered as a muted footer line on the About screen instead of on every route. A build timestamp rendered alongside the version (e.g., injected at build time via `import.meta.env.VITE_BUILD_TIME` or `define` in Vite config) makes "which build am I running" diagnosable at a glance.
- **TypeScript strict build** (**preserve**): [tsconfig.app.json](tsconfig.app.json) enables `strict`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, and related flags; `npm run build` runs `tsc -b && vite build`. Acceptance criterion for the conversion: `npm run build` succeeds with no type errors and no warnings from these flags.
- **PWA manifest** (**follow-up**): [public/manifest.json](public/manifest.json) is linked from [index.html](index.html). Icons and theme color likely need updating to match the dark-theme branding. Not a blocker for the conversion commit; can land as a follow-up PR.

### RESOLVED: Version footer fate

**Context**: [App.tsx](src/App.tsx) renders a version footer (`v0.0.2 - Wireframed auth`). The prototype has no version footer. CLAUDE.md documents it as an intentional affordance.

**Options considered**:
- A) Keep the footer; bump `APP_VERSION` / `APP_VERSION_DESC` during the conversion commit and render from the new app shell.
- B) Keep the footer during the dev/internal phase, gate it behind a build-time flag so it disappears in production.
- C) Drop it entirely to match the prototype.
- D) Drop the always-visible footer; move version info to the About screen (hamburger -> About). PWA debugging stays easy, mobile vertical space is freed.

**Decision**: **D** — remove the App.tsx sticky-bottom footer, render the version (plus a build timestamp for "which build am I running" diagnosis) as a muted line on the About screen. `APP_VERSION` / `APP_VERSION_DESC` constants stay in code and are bumped for this commit; they're just consumed by About instead of every route.

## Data Versioning and Migration

### Strategy: migrate on read, persist on write

Documents are read from Firestore at their stored version and migrated in-memory to the app's current version before use. The original document in Firestore is **not** rewritten during the read - it stays at its old version until the user makes a change that triggers a write. When a write happens, the document is saved at the app's current version.

This means:
- No background migration jobs or Cloud Functions needed
- Old documents are upgraded lazily as users interact with them
- A user who never edits old data keeps their Firestore documents untouched
- The app must be able to read **any** prior version and migrate it forward

### Implementation

```
src/
  migrations/
    index.ts              - migrateDocument() function + registry
    types.ts              - MigrationFn type
    userProfile.ts         - v1->v2, v2->v3, etc. for UserProfile
    wellnessEntry.ts       - version migrations for WellnessEntry
    performanceEntry.ts    - version migrations for PerformanceEntry
```

```ts
// migrations/types.ts
type MigrationFn = (data: Record<string, unknown>) => Record<string, unknown>;

// migrations/index.ts
// Registry keyed by "docType:fromVersion"
// e.g., "userProfile:1" -> migrates v1 to v2

const registry = new Map<string, MigrationFn>();

export function registerMigration(docType: string, fromVersion: number, fn: MigrationFn) {
  registry.set(`${docType}:${fromVersion}`, fn);
}

export function migrateDocument(docType: string, data: Record<string, unknown>): Record<string, unknown> {
  let current = data;
  let version = (current.version as number) ?? 1;
  while (registry.has(`${docType}:${version}`)) {
    current = registry.get(`${docType}:${version}`)!(current);
    version++;
    current.version = version;
  }
  return current;
}
```

### Read/write helpers

```ts
// Firestore read - migrates in memory, does NOT write back
export async function readDoc<T>(ref: DocumentReference): Promise<T | null> {
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return migrateDocument(docTypeFromPath(ref.path), snap.data()) as T;
}

// Firestore write - always writes at current app version
export async function writeDoc<T extends Record<string, unknown>>(
  ref: DocumentReference,
  data: T,
  currentVersion: number,
): Promise<void> {
  await setDoc(ref, { ...data, version: currentVersion });
}
```

### Rules
- `version` starts at `1` for all document types
- Each document type has its own version sequence (UserProfile v3 is independent of WellnessEntry v3)
- Migration functions are pure - no side effects, no async, no Firestore calls
- Migration chain is sequential: v1->v2->v3, never v1->v3 directly
- Missing `version` field is treated as `1` (handles pre-versioning documents)

## Navigation / Routing

Replace `showScreen(screenId)` with React Router routes:

```
/login              -> LoginForm
/signup             -> SignupForm (calls sendEmailVerification on success)
/forgot-password    -> ForgotPassword
/verify-email       -> EmailVerification (shown after signup, non-blocking)

/profile            -> ProfileForm (onboarding step 1)
/setup/tracking     -> TrackedDataSetup (onboarding step 2)

/dashboard          -> Dashboard (home after onboarding)
/wellness           -> WellnessLog
/wellness/:metricId -> MetricDetail
/performance        -> PerformanceLog
/performance/:metricId -> MetricDetail
/add-metric/:type   -> AddMetric (type = wellness | performance)
/info/:topic        -> InfoScreen (topic = athlete-type | gender | comp-term)
/about              -> About
/codap              -> CodapPlugin (iframe-targeted plugin view, see CODAP Plugin section)
```

### Onboarding Flow
The prototype locks the hamburger menu for new users, forcing: Profile -> Tracked Data Setup -> Dashboard. After onboarding completes (`profileComplete && trackingSetupComplete`), all menu items unlock.

In React: a `ProtectedRoute` wrapper checks `UserContext` and redirects incomplete profiles to `/profile`.

### Hamburger Menu Items
1. Dashboard (`/dashboard`)
2. Health & Wellness Log (`/wellness`)
3. Performance Log (`/performance`)
4. Profile (`/profile`)
5. Tracked Data Setup (`/setup/tracking`)
6. About (`/about`)
7. Log Out

Note: the route path remains `/wellness` even though the user-facing label is "Health & Wellness Log". Internal identifiers (component names, file names, route segments, Firestore collection names) keep the `wellness` shorthand. The label rename is presentation-only.

## Design System / CSS

### Color Palette (from prototype CSS variables)
```css
--bg:        #080A0E    /* dark navy background */
--surface:   #0F1318    /* slightly lighter surface */
--surface2:  #161B22    /* secondary surface */
--border:    #4A5D78    /* borders (3.1:1 contrast) */
--accent:    #00B3C0    /* teal accent (primary CTA) */
--text:      #E8EDF5    /* primary text (16:1 contrast) */
--subtext:   #9BAFC4    /* secondary text (4.6:1) */
--muted:     #667A94    /* muted text */
--secondary: #FAF0C8    /* warm secondary accent */
--focus-ring:#4D9FFF    /* blue focus outline (7.6:1) */
```

Note: the prototype uses a **dark theme**. The current app uses a light theme. This will need a decision - adopt the dark theme from the prototype or adapt the component structure to the existing light palette.

### Shared Form Components
The prototype has a consistent form pattern:
```html
<div class="field-wrap">
  <label class="field-label">Label <span class="required-mark">*</span></label>
  <input class="field-input" />
  <p class="field-error-msg">Error text</p>
  <p class="field-hint">Hint text</p>
</div>
```
This maps directly to a `TextField` / `SelectField` component with `label`, `required`, `error`, and `hint` props.

### Button and control variants

Core buttons:
- `.cta-btn` - primary teal CTA (full width)
- `.cta-btn-secondary` - outline variant (note: single class, not `.cta-btn.secondary`)
- `.setup-btn` - onboarding-specific action buttons
- `.enter-btn` - log-entry CTA on the dashboard log sections
- `.codap-btn` - "Analyze Your Data in CODAP" button (logo + label + external-link icon)

Icon/utility buttons:
- `.field-info-btn` - small info icon button (triggers info modal)
- `.metric-info-btn` - info button inside data tables
- `.edit-toggle-btn` - toggles edit mode on Tracked Data Setup
- `.delete-row-btn` - per-row delete (edit mode, Tracked Data Setup)
- `.drag-handle` - drag-to-reorder handle (edit mode, Tracked Data Setup)
- `.eye-btn` - password show/hide toggle
- `.auth-switch-btn` / `.forgot-link` - inline text buttons in auth flows
- `.nav-menu-btn` / `.nav-home-btn` - hamburger and home icons in section headings
- `.back-nav-btn` - back chevron in section headings (platform-aware icon in prototype)
- `.date-nav-btn` - prev/next in DateNav
- `.section-cal-nav-btn` - up/down week nav in section calendars

Pill/toggle controls:
- `.dash-tab` / `.time-range-btn` - pill tabs (1w/2w/30d/3mo/6mo/All, wellness/performance)
- `.collapse-toggle` - expand/collapse section
- `.add-measurement-btn` - dashed-outline "add" button

Custom form controls:
- `.track-check` - custom checkbox (Tracked Data Setup)
- `.avail-radio` - custom radio (Availability tree)
- `.color-swatch` - color-scale picker for certain metric inputs
- `.custom-select` / `.custom-select-trigger` - custom dropdown (replaces native `<select>` in some places)

### Typography

Two font families are used throughout, both from the Barlow superfamily:
- **Barlow** - body text, inputs, paragraphs
- **Barlow Condensed** - labels, headings, buttons (uppercase, letter-spaced)

#### Font loading strategy

- **Self-hosted, not Google Fonts.** WOFF2 files live under `public/fonts/` so the service worker precaches them via the existing `globPatterns` (`**/*.{js,css,ico,png,svg,woff2}` in [vite.config.ts](vite.config.ts)). After first visit, fonts serve from cache with no network cost.
- **Latin subset only.** Download the Latin subset of each face (Google Fonts provides `&subset=latin` URLs or use a tool like `glyphhanger`); dropping Cyrillic, Vietnamese, and extended ranges saves ~60% per face.
- **Four faces only.** Only ship the weights actually used: Barlow 400 (regular) + 700 (bold), Barlow Condensed 600 (semibold) + 800 (extra-bold). Do not precache unused weights.
- **`@font-face` descriptors** use `font-display: swap` as a fallback for the very first paint (before the SW caches). After precache, swap never triggers because the font is already resolved.
- **Preload only above-the-fold faces in `<head>`** so the browser fetches them in parallel with CSS on first paint without flooding the critical-path bandwidth with all four faces. Two preload tags — Barlow Regular 400 (body text + buttons) and Barlow Condensed Extrabold 800 (the DataGOAT wordmark) — cover everything visible above the fold on the auth-screen first paint. The other two faces (Bold 700, Condensed Semibold 600) load via `@font-face` references at lower priority; `font-display: swap` covers the brief gap with the fallback font:
  ```html
  <link rel="preload" href="/fonts/barlow-regular.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/barlow-condensed-extrabold.woff2" as="font" type="font/woff2" crossorigin>
  ```
  PWA offline behavior is unaffected by the preload count: the SW `globPatterns` precache (`**/*.{js,css,ico,png,svg,woff2}`) caches all four WOFF2 files on first install regardless of which ones are preloaded. Preload tags only affect the *online* first-paint priority.

### Iconography

The 2026-04-27 prototype contains 113 inline `<svg>` icons. Distribution:

- **Size**: 108 of 113 are 24×24 (the standard); a handful at 14/16/18/22/40 for chrome (chip swatches, large brand mark, etc.)
- **Stroke**: 106 use `stroke-width="2"`; 15 use `2.5` (back-chevron and date-nav arrows); a few use `2.2` / `1.5`
- **Paint**: most use `currentColor` so the icon adapts to the surrounding text/button color (essential for hover states, focus indicators, and active/inactive contrast)
- **Branded SVG files**: only 3 icons are referenced as `<img src="icons/...svg">` rather than inlined — `datagoat-logo-login.svg`, `google-logo.svg`, `facebook-logo.svg`. These are multi-color brand marks, not theme-aware glyphs.

**Decision: `vite-plugin-svgr` for glyphs, plain URL imports for brand marks.**

The ~30 unique prototype glyphs are extracted into individual `.svg` files and imported as React components via `vite-plugin-svgr`'s `?react` query suffix. The 3 brand SVGs stay as URL imports rendered through `<img>` (matching the prototype's existing markup). See the Dependencies section for the package addition; SVGR is configured globally in `vite.config.ts`.

```
src/
  icons/
    home.svg
    hamburger.svg
    back-chevron.svg
    info.svg
    edit.svg
    eye.svg
    eye-off.svg
    ... (one .svg per unique prototype glyph; ~30 files)

public/
  icons/
    datagoat-logo-login.svg     ← brand mark (URL import; see "Brand SVGs" below)
    google-logo.svg
    facebook-logo.svg
```

**Glyph icons (svgr):**

```tsx
import HomeIcon from '@/icons/home.svg?react';

// Default: aria-hidden, currentColor inherits, stroke-width 2 from the source SVG
<HomeIcon />

// Override props as needed; svgr spreads them onto the root <svg>
<HomeIcon strokeWidth={2.5} className={css.headerIcon} />
```

**SVGR configuration** (in `vite.config.ts`): use a custom svgr template that injects `aria-hidden="true"` on the root `<svg>` element of every generated component, so glyph icons are decorative by default. Buttons containing only an icon supply `aria-label` on the **button**, not the icon. The rare case where an icon needs to be exposed to assistive tech (a chart `<title>`/`<desc>`, or a status indicator) is handled by passing `aria-hidden={false}` + a labelling attribute at the call site.

The semi-opaque teal accent fills (`rgba(0,179,192,0.35)` on home / calendar / edit glyphs) stay hardcoded in the source `.svg` files - they're a deliberate accent, not a theme variable. Stroke colors and primary fills inherit `currentColor` (already true in the prototype source).

**Brand SVGs (URL imports):**

```tsx
import googleLogo from '@/icons/google-logo.svg';     // URL string, no ?react

<img src={googleLogo} alt="Google" />
```

The 3 brand SVGs (`datagoat-logo-login.svg`, `google-logo.svg`, `facebook-logo.svg`) stay as URL imports for three reasons:

1. **PWA neutrality**: the existing service-worker glob (`**/*.{js,css,ico,png,svg,woff2}` in [vite.config.ts](vite.config.ts)) precaches both URL-imported SVGs and svgr-inlined SVGs. After install, the two paths are functionally indistinguishable. The first-visit cost is the only differentiator, and brand marks are small enough that any flicker is acceptable.
2. **Bundle accounting**: the DataGOAT goat logo is path-heavy art (~several KB raw). Keeping it out of the JS bundle preserves the 250 KB initial-JS soft budget (see Performance budget).
3. **Brand semantics**: brand marks aren't theme-aware glyphs. Inlining them as `currentColor`-aware components invites accidental recoloring; URL imports + `<img>` keep brand colors locked.

To eliminate first-visit flicker on the most prominent brand mark, add a preload tag in `index.html` (mirroring the font preload pattern in Typography → Font loading strategy):

```html
<link rel="preload" as="image" href="/icons/datagoat-logo-login.svg">
```

Google and Facebook marks are smaller and less prominent (below-the-fold-ish on auth screen first paint); a preload tag for each is overkill.

**Rules:**
- Glyph icons always import via `?react` from `src/icons/`. Brand marks always import as URLs.
- `aria-hidden="true"` is the SVGR-injected default for glyph components. Override only when the icon is the sole accessible name.
- Don't add new icons to the brand-mark category. New theme-aware glyphs go through the svgr path.
- Don't reach for an icon library or sprite sheet. The svgr path covers per-icon tree-shaking, prop forwarding, and a11y defaults; the URL-import path covers brand marks. There's no third use case in this app.

### Accessibility primitives

- `.skip-link` - "skip to main content" link shown on focus (off-screen by default)
- All interactive controls meet a 44x44 minimum touch target
- `:focus-visible` uses `--focus-ring` (#4D9FFF) with 2px outline and 2px offset
- **Visually-hidden utility** in [src/components/common.module.css](src/components/common.module.css), imported as `common.visuallyHidden`. Used by Chart accessibility (hidden data tables, per-cell calendar labels) and any other "exposed to screen readers but not sighted users" pattern. Canonical rule:
  ```css
  .visuallyHidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  ```
  CSS Modules camelCases the class name; consumers write `<span className={common.visuallyHidden}>…</span>`.

### Motion tokens

The prototype uses ~15 distinct transition / animation values across its 100+ rules. Without tokens, each component will pick its own and they drift. The set below is the deduplicated extract from the 2026-04-27 prototype - port these as CSS custom properties (e.g., on `:root` in [src/index.css](src/index.css)) so component CSS Modules reference tokens, not raw numbers.

**Duration tokens:**
```css
--dur-tap:       100ms;   /* press-feedback transforms (scale 0.94-0.98) */
--dur-quick:     150ms;   /* color / border / background hover (most micro-interactions) */
--dur-base:      200ms;   /* default state changes; also menuSlideDown enter */
--dur-carousel-x: 600ms;  /* dashboard header-slide transform */
--dur-carousel-o: 400ms;  /* dashboard header-slide opacity */
```

**Easing tokens:**
```css
--ease-default: ease;                              /* CSS default; most transitions don't override */
--ease-out:     ease-out;                          /* one-shot growth (accent-line reveal, menu slide-down) */
--ease-in-out:  ease-in-out;                       /* opacity fades, ambient shimmer */
--ease-bounce:  cubic-bezier(0.34, 1.3, 0.64, 1);  /* dashboard header carousel ENTER (overshoot) */
--ease-accel:   cubic-bezier(0.6, 0, 0.7, 0.2);    /* dashboard header carousel EXIT (accelerate) */
```

The Material-Design `cubic-bezier(0.4,0,0.2,1)` curve in the prototype is only used on the phone-shell resize transition, which is stripped (see "What to Strip"). Do not port it.

**Named keyframe animations** (port verbatim into the component CSS Module that owns them, not into a shared file):

| Animation | Duration | Easing | Trigger | Lives in |
|---|---|---|---|---|
| `accent-grow` | 600ms | `ease-out` (delay 100ms, `both`) | Auth screen first paint - accent line grows in | `LoginForm.module.css` (or shared auth) |
| `accent-shimmer` | 6s | `ease-in-out` (infinite) | Auth screen ambient - accent-line color shimmer | same as `accent-grow` |
| `menuSlideDown` | 200ms | `ease-out` | Hamburger nav opens | `HamburgerMenu.module.css` |
| Header-slide enter | 600ms | `--ease-bounce` (transform), 400ms `ease-in-out` (opacity) | Dashboard header carousel transitions to a new slide | `DashboardHeaderSlide.module.css` |
| Header-slide exit-left | 600ms | `--ease-accel` (transform), 400ms `ease-in-out` (opacity) | Outgoing slide leaves to the left | same |

**Rules:**
- Component CSS Modules reference tokens (`transition: background var(--dur-quick) var(--ease-default)`), not raw values.
- Hover / focus / active state changes use `--dur-quick` (150ms) by default. Tap-feedback transforms use `--dur-tap` (100ms).
- The carousel curves (`--ease-bounce`, `--ease-accel`) are signature - reuse them only for the header carousel. Other "fancy" animations should default to `ease-out` or `ease-in-out`, not invent new beziers.
- All long-running / decorative animations must be guarded by `prefers-reduced-motion` (see Reduced motion below). Tokens are values; the opt-out is policy.

### Reduced motion

All ambient animation must opt out when the user requests reduced motion (WCAG 2.3.3, `prefers-reduced-motion`). Two layers:

- **CSS**: every `@keyframes` rule and long-running `transition` used for decorative / ambient motion (accent-line shimmer, hamburger menu slide-down, dashboard header slide, chart enter animations) is wrapped in `@media (prefers-reduced-motion: reduce)` blocks that set `animation: none` and `transition: none` (or collapse to the end state).
- **JS timers**: the dashboard header carousel and motivation-message rotation check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` at schedule time. When matched, the carousel holds on the first slide and only advances on explicit user interaction (tap on goat logo). Existing timers are cleared when the match state changes via the matchMedia `change` event.

Essential motion is retained: `:focus-visible` outlines, click/tap feedback (`transform: scale(...)`), and hover color transitions are short enough to be non-disruptive and do not need to be disabled.

**Token policy** (works with the Motion tokens subsection above):
- **Essential** (active under reduced motion): `--dur-tap` (100ms tap-feedback transforms), `--dur-quick` (150ms hover/focus state changes), `--dur-base` (200ms simple state changes that aren't ambient or layout-shifting).
- **Decorative** (zeroed under reduced motion): `--dur-carousel-x` (600ms), `--dur-carousel-o` (400ms), `--ease-bounce`, `--ease-accel`, the named keyframes `accent-shimmer` and the dashboard header carousel transitions.
- A reviewer can grep for each decorative token and verify its consumers are wrapped in `@media (prefers-reduced-motion: reduce)` that sets the duration to `0s` (or the animation to `none`).

### Keyboard-accessible drag-and-drop (Tracked Data Setup)

The drag-reorder interaction in edit mode must work for keyboard-only and screen-reader users, not just pointer/touch. `@dnd-kit/core` supports this natively via `KeyboardSensor`; the spec locks in the contract so it's implemented, not skipped.

- `.drag-handle` is a focusable element (`role="button"`, `tabindex=0`, `aria-label="Reorder <metric name>"`)
- `DndContext` registers all three sensors: `TouchSensor` (mobile, primary), `KeyboardSensor` (a11y), `PointerSensor` (desktop/pen)
- Keyboard flow (via `KeyboardSensor`'s defaults):
  - `Tab` focuses a handle
  - `Space` or `Enter` picks the item up
  - `Arrow Up` / `Arrow Down` moves it within the list
  - `Space` or `Enter` drops
  - `Escape` cancels and restores the original position
- `DndContext.accessibility.announcements` is supplied so screen readers narrate pickup / over / dropped / canceled events (`"Practice picked up. Position 3 of 8. Use arrow keys to move."` / `"Practice dropped at position 5 of 8."`)

### Chart accessibility

SVG charts are not readable by screen readers by default. The chart components must ship with a11y affordances from day one - retrofitting later is costly. Applies to `MetricChart`, the Metric Detail inner chart, and `ActivityCalendar`.

- Every chart component accepts `title` and `description` props that render as `<title>` and `<desc>` elements inside the `<svg>`.
- The `<svg>` has `role="img"` and `aria-labelledby` pointing at the `<title>`'s id (plus `aria-describedby` for `<desc>` when provided).
- **Metric Detail** charts render an adjacent `<table>` listing date/value pairs. Table uses `className={common.visuallyHidden}` (see Accessibility primitives) - screen-reader accessible but not sighted, *not* `display: none` / `hidden` which would also hide it from assistive tech. Revealed to sighted users by a visible "Show data" toggle button that swaps the class off.
- **Activity calendars** add a visually-hidden label on each cell (`<span className={common.visuallyHidden}>Nov 3, 2026: all metrics logged</span>`) so focused/screen-reader traversal announces each day's state. The existing visible legend stays as-is.
- Color-only encoding is backed up by text or shape (e.g., the wellness-teal vs performance-coral cells are also labeled in the legend and in the hidden per-cell descriptions).

### Charts
**This conversion ships chart placeholders, not the real SVG charts.** `<MetricChart>` and the Metric Detail inner chart render as gray-box placeholder components at the final dimensions, accepting the full final prop surface (`type`, `data`, `goalLine`, `averageLine`, `title`, `description`) and exposing the chart-accessibility contract (`role="img"`, `<title>`, `<desc>`, the visually-hidden data-table seam — all of which are fully working). The Dashboard chart cards wire up the metric dropdown + TimeRangePicker around the placeholder, and the per-chart data-table toggle is real (so screen-reader users have a complete experience even without the visual chart).

**Real chart rendering — SVG path generation, scales, axes, line/bar drawing, goal/average lines — is a follow-up story** with its own design doc. The follow-up swaps the placeholder visual without touching the prop API, the DashboardChartCard wiring, the a11y contract, or any consumer call site. The implementation spec pins this seam so the swap is purely the path-generation math.

Custom SVG (not Chart.js) is the long-term direction; the prototype's chart-rendering functions remain the source of truth when the follow-up lands.

## CODAP Plugin

The DataGOAT app doubles as a CODAP plugin. When loaded inside a CODAP iframe, it detects the iframe context and switches to a data export UI instead of the full app.

### Architecture

Same codebase, same origin, same Firebase Auth. No separate plugin project.

```
src/
  codap/
    CodapPlugin.tsx          - main plugin view (dataset selection, export controls)
    CodapPlugin.module.css
    codapApi.ts              - thin wrapper around @concord-consortium/codap-plugin-api
```

### Detection

Plugin mode is triggered by **route, not iframe detection**. The app exposes a `/codap` route that renders `CodapPlugin`; every other route goes through the normal app shell (auth, mobile container, routing, footer, etc.).

```
/codap              -> CodapPlugin (plugin view, no mobile container)
```

The DataGOAT app constructs the CODAP URL as `https://codap.concord.org?di=https://datagoat.concord.org/codap`, so CODAP loads the `/codap` route directly in its iframe. An iframe-detection hook (`useIsCodap`) is deliberately not used - `window !== window.parent` is a false-positive magnet (dev-tool previews, unrelated embeds) and the URL construction is already under our control. Route-based gating is simpler, explicit, and avoids a post-message handshake for a boundary that doesn't carry auth weight.

The `/codap` route is **not** wrapped in `ProtectedRoute`. `CodapPlugin` inspects `AuthContext.user` directly and renders either the data-export UI (authenticated) or the "Log into DataGOAT first, then reload this plugin" message (unauthenticated) - matching the auth behavior described in the "Auth in iframe" subsection below.

### Auth in iframe

Firebase Auth uses IndexedDB for persistence, scoped to the origin. Since the plugin iframe is served from the same origin as the main app, the user's existing auth session is available automatically - no login needed in the plugin.

If the user hasn't logged into DataGOAT yet, the plugin shows: "Log into DataGOAT first, then reload this plugin."

Login via popup/redirect is intentionally **not** supported inside the iframe - browsers block these in cross-origin iframes and the behavior is unreliable.

### What the plugin skips

- Mobile container shell (440px cap, surround)
- PWA service worker registration
- Hamburger nav, version footer
- Full app routing

### What the plugin shows

- CODAP connection status
- Dataset selection (which wellness/performance metrics to send)
- Date range picker
- "Send to CODAP" button that pushes data as CODAP datasets via the plugin API
- Read-only - no data entry or editing from within CODAP

### User flow

1. Student logs into DataGOAT app normally in a browser tab
2. Student taps "Analyze Your Data in CODAP" on the Dashboard (always visible; behavior depends on viewport - see below)
3. Clicking it opens CODAP with `?di=https://datagoat-b07dd.web.app` (or a dedicated `/codap` route)
4. CODAP loads the plugin in an iframe
5. Plugin finds the existing Firebase Auth session - user is already authenticated
6. Student selects which metrics to analyze, plugin sends data to CODAP
7. Student explores their data in CODAP's analysis tools

### CODAP button behavior

The "Analyze Your Data in CODAP" button behavior differs by viewport:

- **Desktop/tablet (>= 640px)**: Opens CODAP with `?di=https://datagoat.concord.org` in a new tab
- **Mobile (< 640px)**: Opens a modal telling the user to visit `datagoat.concord.org` on their desktop to use CODAP, since CODAP doesn't work well on small screens

## Dependencies

The conversion adds the following libraries to [package.json](package.json). No existing deps are removed.

| Package | Purpose |
|---|---|
| `react-router-dom` | Client-side routing for the 11+ screens described above |
| `react-hook-form` | Uncontrolled form state for profile + log-entry screens (many fields, performance-sensitive) |
| `zod` | Schema validation composed per-metric; feeds Hook Form via the resolver below |
| `@hookform/resolvers` | Glue between `react-hook-form` and `zod` |
| `@dnd-kit/core` | Drag-and-drop reordering on Tracked Data Setup (edit mode). Chosen over `react-dnd` because it ships a dedicated `TouchSensor` (primary form factor is mobile) alongside `KeyboardSensor` (WCAG keyboard-drag support) and `PointerSensor` (desktop/pen) that compose cleanly. `react-dnd` has no first-class keyboard story and weaker touch handling. |
| `@dnd-kit/sortable` | Sortable-list preset on top of `@dnd-kit/core` for the reorder UX |
| `@concord-consortium/codap-plugin-api` | Concord-maintained client for the CODAP plugin postMessage handshake + data-context API. Used by `src/codap/codapApi.ts` (a thin DataGOAT-specific wrapper). Lazy-loaded with the rest of `/codap`, so no impact on the main bundle. Chosen over hand-rolled glue because it tracks CODAP's protocol authoritatively as it evolves. |
| `vitest` (dev) | Test runner (see Testing section) |
| `@vitest/ui` (dev, optional) | Vitest dashboard for local dev |
| `vite-plugin-svgr` (dev) | Imports `.svg?react` as React components for the ~30 glyph icons in `src/icons/`. Brand marks (Google, Facebook, DataGOAT) remain URL imports rendered as `<img>` - see Design System / CSS → Iconography. |

Self-hosted font files (Barlow + Barlow Condensed WOFF2) are added under `public/fonts/` rather than via a runtime Google Fonts dependency - see the Typography section and Self-Review font-loading decision.

## Testing

Test coverage in this commit is **scoped deliberately narrow**: only the data migration chain is covered. UI tests are deferred until the UI stabilizes after first-user feedback.

**In scope (this commit):**
- `vitest` set up. Configured via `vite.config.ts` / `vitest.config.ts` so tests run in the same environment as the app.
- package.json scripts added:
  - `"test": "vitest run"` (single pass, for CI)
  - `"test:watch": "vitest"` (watch mode, for local dev)
  - `"test:ui": "vitest --ui"` (optional, Vitest dashboard)
- Unit tests for `migrateDocument()` and each registered migration function. Migrations are pure, deterministic, and the place where silent data corruption hides months later - high-value test surface for low effort.
- Fixture docs at each version per document type (`userProfile`, `wellnessEntry`, `performanceEntry`) so migrations are exercised end-to-end (v1 -> current).

**Test file convention (applies spec-wide, not just migrations):**

Tests are **colocated** with the code they test, not gathered in a top-level `__tests__/` or `tests/` tree. For any source file `foo.ts`:
- Tests live alongside as `foo.test.ts`
- Fixtures live alongside as `foo.fixtures.ts`

Example (migrations):
```
src/migrations/
  index.ts
  index.test.ts
  userProfile.ts
  userProfile.test.ts
  userProfile.fixtures.ts       // { 1: v1Doc, 2: v2Doc, ... }
  wellnessEntry.ts
  wellnessEntry.test.ts
  wellnessEntry.fixtures.ts
  performanceEntry.ts
  performanceEntry.test.ts
  performanceEntry.fixtures.ts
```

Vitest's default discovery picks up `*.test.ts` files anywhere under `src/`, so no config changes are needed. Follow this convention when component / E2E tests land in a future story.

**Out of scope (follow-up story):**
- Testing Library / component tests for individual screens
- E2E / integration tests against the Firebase emulator
- Visual regression tests
- CODAP plugin tests (requires a mock postMessage host)

Rationale: the "big-commit" UI is likely to churn after first-user review, so locking in UI tests now would generate throw-away coverage. Migration tests protect against data-corrupting regressions regardless of UI churn.

## Performance budget

The conversion adds many deps and components at once. To keep first-paint on school-network mobile acceptable, the PR **reports** its bundle impact and honors a soft budget.

**Reporting** (required): the PR description includes:
- `dist/` gzipped initial-JS size (the JS downloaded on first paint of `/`)
- `dist/` total precache size (everything the service worker caches)
- Comparison against `main` at branch point (same measurements)

**Soft budget** (exceeding triggers a discussion, not an automatic block):
- Gzipped initial JS <= 250 KB
- Total precache <= 500 KB

**Lazy-load seam — only one in scope for this conversion** (per resolved interview decision):
- `CodapPlugin` (and the `@concord-consortium/codap-plugin-api` library) load only under the `/codap` route (via `React.lazy` + `Suspense`). Zero cost for the 99% of users who never visit `/codap`.

The other two pre-identified seams (chart library, `@dnd-kit`) are **not** lazy-loaded:
- The chart components are placeholder gray-box components in this conversion (real charts are a follow-up story), so their bytes are negligible.
- `@dnd-kit/core` + `@dnd-kit/sortable` are loaded eagerly because `@dnd-kit` runs during onboarding for every new user (Tracked Data Setup → edit mode is part of the first-run flow when adding the initial set) and again whenever a returning user edits their metrics list. It's not a niche path that warrants a split-point.

If the bundle budget is blown, **revisit `@dnd-kit` first** (it's the larger of the two) before widening the budget.

**Animation / frame-rate check** (measurement, not a hard threshold): the PR description includes a recorded Chrome DevTools performance profile of the Dashboard under 4x CPU throttling + "Slow 4G" network, captured for ~10 seconds covering at least one full motivation-message cycle. Reviewer eyeballs for frame-rate drops, long tasks, and layout thrash. No numeric pass/fail - this is a sanity check before shipping to school networks, not a gate.

**Ambient-animation coordination**: when multiple ambient animations would otherwise run simultaneously, pause the lower-priority one. Concretely: pause the dashboard header-slide carousel while the hamburger nav overlay is open (both animate, no need to compete for CPU and user attention).

## Implementation Order

1. **Routing + layout shell** - React Router, AppHeader, HamburgerMenu, SectionHeading
2. **Auth screens** - LoginForm, SignupForm, ForgotPassword, EmailVerification (replace current wireframe auth)
3. **UserContext + ProfileForm** - profile data in Firestore, onboarding gate
4. **TrackedDataSetup** - metric selection, persisted to user profile
5. **DataContext + WellnessLog** - daily data entry with date navigation
6. **PerformanceLog** - same pattern as wellness
7. **Dashboard** - summary view, motivation messages, charts
8. **MetricDetail** - single metric deep dive with chart
9. **AddMetric + InfoScreens** - secondary flows
10. **About screen** - static content
11. **CODAP plugin** - iframe detection, plugin API client, data export UI, desktop-only button

## Out of Scope

- **Privacy / IRB review and consent workflow**: Profile collection captures student PII (full name, email, age, height, weight, gender, athlete type). Any privacy / IRB review, FERPA posture for school deployments, and parental-consent flow for minors are deferred to a follow-up story owned by Concord's privacy / research-ops team. This conversion ships the profile-collection UI but **must not be released to students until that review clears**.
- **Firestore-persistence code paths beyond the contexts described in this spec**: tracked-metric order persistence, per-day availability defaults, offline write queue - follow-up stories.
- **CODAP plugin test harness**: a mock postMessage host for unit-testing `codapApi.ts` is a separate story.
- **PWA manifest icons / theme color update** to match the dark-theme branding - a small follow-up PR.
- **Test framework for UI / E2E / visual regression**: only migration-chain unit tests are in scope for this commit (see Testing section).

## Deferred Work

This conversion ships with two pieces of work intentionally deferred to follow-up stories. Each lands behind a stable seam in this PR (placeholder component, registry-driven data shape) so the follow-up is purely the swap, not new plumbing. The risk to manage: the placeholders are **shipped, visible, and load-bearing** — if the follow-ups never get filed as tracked tickets, the placeholder ships to end users indefinitely.

**Acceptance criterion for closing the conversion epic**: every item below MUST be filed as its own tracked Jira ticket before this story's parent epic is closed, even if the tickets remain unimplemented. The tickets are the lifecycle anchor — without them, "deferred" silently becomes "forgotten."

### Real chart rendering

- **What's deferred**: SVG path generation, scales, axes, line/bar drawing, goal/average lines for `<MetricChart>` and the Metric Detail inner chart.
- **What ships now**: gray-box `<rect>` placeholder at the final dimensions, full prop API (`type`, `data`, `goalLine`, `averageLine`, `title`, `description`), complete a11y contract (`role="img"`, `<title>`, `<desc>`), and a fully working visually-hidden `<ChartDataTable>` with "Show data" toggle so screen-reader users have a complete experience even before the visual chart lands.
- **Acceptance for the follow-up**: the placeholder gray-box and "Chart placeholder — TBD" text are gone from every consumer; visual chart renders for all metrics in the Dashboard chart cards and the Metric Detail screen; data-table toggle continues to work; **the prop API, the dimensions, the a11y wiring, the data-flow plumbing from DataContext through DashboardChartCard, and the consumer call sites are unchanged** — the swap is purely path-generation math.

### Designer-final PerformanceLog metric set

- **What's deferred**: per-athlete-type performance metric sets (Endurance vs. Strength and Power) — the designer is iterating on the real sets and they aren't final at conversion time.
- **What ships now**: a placeholder set (Wins, Losses, Goals, Assists, Yards, Tackles) read from the `PERFORMANCE_METRICS` registry in `src/metrics/performanceMetrics.ts`. The registry shape (`MetricDefinition[]`) is the seam; consuming components (PerformanceLog, MetricDetail, AddMetric, DashboardChartCard) read from the registry, never from a hardcoded list.
- **Acceptance for the follow-up**: PerformanceLog displays the correct metric set per the user's `athleteType` from `UserContext`; **the registry is the only file that changes**; no UI component edits required.

### User-configurable PerformanceTotals window

- **What's deferred**: a UI affordance for switching the `PerformanceTotals` totals between season-bounded, monthly, and all-time views.
- **What ships now**: totals are computed over the visible HISTORY window (last 30 days), matching the date-nav range so the totals column is consistent with the rest of the screen.
- **Acceptance for the follow-up**: a window-picker (or similar UX) lets the user choose the totals window; the computation is parameterized over the window, not hardcoded to HISTORY. Likely waits until the designer-final metric set lands and real users surface the use case.

## Decisions

- **Theme**: Adopt the prototype's dark theme. Discard the current app's light styling entirely - the design's color palette (`--bg: #080A0E`, `--accent: #00B3C0`, etc.) becomes the source of truth.
- **Chart library — placeholders this conversion, real charts as follow-up**: Ship `<MetricChart>` and the Metric Detail inner chart as gray-box placeholder components in this conversion (final dimensions, full prop API, complete `role="img"` / `<title>` / `<desc>` accessibility wiring, working visually-hidden data table). The Dashboard chart cards wire up the metric dropdown + TimeRangePicker around the placeholder. **Real chart rendering** — SVG path generation, scales, axes, line/bar drawing, goal/average lines — lands in a follow-up story with its own design doc; the swap is purely the path-generation math because the props, dimensions, a11y wiring, and data-flow plumbing are already in place. Custom SVG (not Chart.js) remains the long-term direction; the prototype's chart-rendering functions are the source of truth when the follow-up lands.
- **Form validation**: React Hook Form + Zod. Uncontrolled inputs for performance on log entry screens with many fields. Zod schemas can be composed per-metric and later built dynamically if metric definitions move to Firestore.
- **Metric definitions**: Hardcoded initially, but structured so that the same shape could come from Firestore per-user config later. Define a `MetricDefinition` type and keep all definitions in a central `metrics.ts` file rather than spreading them across components. Each definition includes the `whoCollects` and `howCollected` info-modal copy; **port the latest prototype's text** as the source of truth (not earlier snapshots). Designer-confirmed expansions in the 2026-04-27 prototype: Lean Mass `whoCollects` is `"SC (Strength and Conditioning Coach), AT (Athletic Trainer), Nutrition"` and `howCollected` is `"Skinfolds, BIA (Bioelectrical Impedance Analysis), BIS (Bioimpedance Spectroscopy), DXA (Dual-Energy X-ray Absorptiometry)"`; Availability `whoCollects` is `"AT (Athletic Trainer), Self"`. Treat these as a sample of the broader pattern: when porting, copy the prototype's strings verbatim rather than abbreviating.
- **Availability input**: Use the current prototype design - a nested yes/no tree: "Did you have practice today? Y/N" -> "Did you participate? Y/N", and the same pair for Game. Sub-values are `played` / `dnp`. This may be updated by the designer before conversion - treat it as provisional.
- **Log data entry inputs**: Manual numeric entry only via the on-screen keyboard. **No sliders, steppers, or +/- buttons** on Health & Wellness Log or Performance Log inputs. Designer reviewed enhanced controls and rejected them in favor of plain numeric inputs.
- **Tappable calendar touch targets**: Health & Wellness dashboard calendar cells are interactive even though their hit area is below the 44x44 px guidance (the cell width on a 375 px viewport is roughly 32 px). Designer accepted this trade-off explicitly so the content team can field-test the navigation pattern. **Field-test contract**: at least 5 sessions with real users tapping cells across multiple days, recording mis-tap rate (taps that hit the wrong cell or miss). **Revisit triggers**: > 15% mis-tap rate, or any user feedback citing the size as a barrier. **Revisit options if triggered**: (a) increase tap area via invisible padding (`::before` with negative offsets, like the prototype's `.section-cal-nav-btn::before`), (b) add long-press confirmation, or (c) drop the interactive cell and add an explicit "Jump to date" picker. This story does not block on the field test; it lands the interaction with the trade-off documented. Compensating affordances ship with this build: visible hover/focus indicator, `:focus-visible` outline using `var(--focus-ring)`, Enter/Space activation, and a per-cell visually-hidden label so screen readers announce the day's state and that it's actionable.

## Acceptance criteria

The PR reviewer can use this as a Definition of Done. Each checkbox below corresponds to a requirement elsewhere in this spec; the list exists as a single consolidated checklist.

- [ ] All 11 screens from the Screens Identified table are reachable via React Router (auth-shell split across `/login`, `/signup`, `/forgot-password`, `/verify-email`; plus `/profile`, `/setup/tracking`, `/dashboard`, `/wellness`, `/wellness/:metricId`, `/performance`, `/performance/:metricId`, `/add-metric/:type`, `/info/:topic`, `/about`, `/codap`)
- [ ] Auth flows functional against the Firebase Auth emulator: email/password sign-in, Google OAuth sign-in, **Facebook OAuth sign-in**, registration, forgot-password email send, email-verification send + resend, sign-out
- [ ] Both `LoginForm` and `SignupForm` show "Continue with Google" + "Continue with Facebook" social buttons above the email/password form, separated by an `or` divider; OAuth users with `user.emailVerified === true` skip the verification screen and banner; `auth/account-exists-with-different-credential` triggers the inline account-linking flow (LoginForm/SignupForm flips to linking mode, calls `fetchSignInMethodsForEmail`, shows the appropriate sign-in path for the existing provider, and on success calls `linkWithCredential` to attach the pending Facebook credential); OAuth popup-flow rejections route through `logError`
- [ ] **`beforeUserCreated` Cloud Function blocking trigger** rejects Facebook sign-in attempts where `email` is null/missing. The function lives under `functions/src/auth/blockFacebookMissingEmail.ts`, has unit tests, runs against the Firebase Functions emulator, and deploys as part of `npm run deploy:functions`. The Firebase project is upgraded to Identity Platform (deployment prerequisite documented in CLAUDE.md). Client maps the resulting `auth/internal-error` to the synthetic `blocked-no-email` message and surfaces it inline on the auth screen.
- [ ] User-facing label "Health & Wellness Log" replaces "Wellness Log" everywhere it appeared in the previous prototype (screen heading, dashboard section heading, hamburger menu item, dashboard log CTA, "Add Health & Wellness Metric" page title, status messages, aria-labels). Internal identifiers (route `/wellness`, component names, Firestore collection names) keep the `wellness` shorthand
- [ ] Health & Wellness dashboard calendar cells are interactive only when both filters pass (`state !== inactive` AND offset is in `[0, HISTORY]`); future-dated cells are explicitly non-interactive. Tappable cells respond to click/tap and Enter/Space, navigating to `/wellness?date=YYYY-MM-DD`. WellnessLog and DateNav read the date via `useSearchParams()`, falling back to today when `?date=` is absent. Direct navigation (hamburger / dashboard CTA / back from MetricDetail) routes to `/wellness` with no search param. Performance calendar cells remain non-interactive in this story. Visible hover/focus indicator on tappable cells; `:focus-visible` uses `var(--focus-ring)`
- [ ] Health & Wellness Log date nav renders a dynamic completeness chip + "Data entered: All / Some / None" legend. Chip uses **color + shape** (All = solid, Some = striped, None = empty bordered) so the cue is not color-only. Chip updates as the user enters/clears data on that date and as the user navigates between dates. Performance Log date nav stays label-only (no chip/legend)
- [ ] Health & Wellness Log + Performance Log inputs are plain numeric text fields - no sliders, steppers, or +/- controls (per Decisions)
- [ ] Preserved auth logic from existing [Login.tsx](src/components/Login.tsx): handlers, `authErrorMessages` map, `registeredDisplayName` bridging pattern in App.tsx
- [ ] New-user onboarding flow reaches Dashboard through Profile -> Tracked Data Setup; hamburger menu is disabled until `profileComplete && trackingSetupComplete`
- [ ] `ProtectedRoute` uses the `ProfileLoadState` tri-state (loading / missing / loaded); returning users are not kicked to `/profile` while the Firestore fetch is in flight
- [ ] Tracked Data Setup edit mode reveals delete buttons and a working drag-reorder; `@dnd-kit/core` is wired with `TouchSensor` + `KeyboardSensor` + `PointerSensor`; keyboard drag narrates via `announcements`
- [ ] CODAP plugin view renders at `/codap` route (no iframe detection); plugin view skips mobile container, PWA registration, hamburger, version footer
- [ ] Dashboard includes: header slide + motivation carousel, wellness + performance activity calendars, log-status CTA buttons, two chart cards with time-range picker (1w / 2w / 30d / 3mo / 6mo / All), "Analyze Your Data in CODAP" button. **Charts inside the cards are placeholder gray-box components** at the final dimensions accepting the full final prop surface; real SVG chart rendering is a follow-up story (per Decisions: Chart library)
- [ ] All `@keyframes` / long transitions and JS carousel timers honor `prefers-reduced-motion`
- [ ] Every chart component exposes `title` + `description` as `<title>`/`<desc>` inside `role="img"` SVGs; Metric Detail charts have a visually-hidden adjacent data table with a "Show data" toggle; activity calendars have visually-hidden per-cell labels
- [ ] Mobile container structure from DGT-6 preserved with the column **narrowed from 640px to 440px** to match the prototype (two-tier height: `100dvh` below 1024px, `95dvh` centered at >=1024px; landscape-phone collapse, `box-sizing` reset, `tabIndex={0}` keyboard-scroll on `<main>`) and the visible surround affordance removed (no body/column background differentiation, no column border, no drop shadow). `<main>`'s `:focus-visible` outline uses `var(--focus-ring)`. Works at the updated viewport matrix (375 / 414 / 439 / 440 / 896 / 1023 / 1024 / 1440 px) in Chrome / Safari / Edge desktop, Android Chrome, and iOS Safari
- [ ] Content-fit verification at **both 375 px** (narrowest real device) **and 440 px** (column max) for data-dense screens — repeat each check at both widths:
  - [ ] Profile form: inline Age / Height (Ft + In) / Weight rows legible without horizontal scroll
  - [ ] Performance Log table: Total / Metric / Record columns readable, value inputs usable
  - [ ] Dashboard activity calendars: 7 cells + up/down nav buttons fit with the month label column
  - [ ] Dashboard chart cards: metric dropdown + chart + time-range picker pills fit on one row / column as designed
- [ ] PWA auto-update behavior preserved: NetworkFirst for HTML, cache warming on first visit, SW update check on `visibilitychange`, auto-reload on `controllerchange`
- [ ] [firestore.rules](firestore.rules) unchanged; all DataContext paths fall under the existing `/users/{userId}/**` rule
- [ ] Firebase emulator wiring in [firebase.ts](src/firebase.ts) extended with `connectFirestoreEmulator` alongside the existing auth-emulator call
- [ ] Version display moved off App.tsx (sticky footer removed, styles removed from App.module.css) and onto the About screen as a muted footer line, with `APP_VERSION` / `APP_VERSION_DESC` bumped and a build timestamp injected via Vite (`import.meta.env.VITE_BUILD_TIME` or `define`)
- [ ] All new dependencies listed in the Dependencies section are added to [package.json](package.json) and [package-lock.json](package-lock.json) is updated
- [ ] All glyph icons imported via `vite-plugin-svgr` from `src/icons/` (`?react` query); SVGR template injects `aria-hidden="true"` on every generated `<svg>`; brand SVGs (datagoat / google / facebook) imported as URLs from `public/icons/` and rendered via `<img>`; auth-screen DataGOAT logo preloaded via `<link rel="preload" as="image">` in [index.html](index.html). Icon-only buttons carry `aria-label` on the button, not the icon
- [ ] Vitest set up with `test` / `test:watch` scripts in package.json; migration-chain unit tests pass for all registered migrations (fixture docs at each version per document type)
- [ ] Tests and fixtures colocated with the source they cover (`foo.test.ts`, `foo.fixtures.ts` next to `foo.ts`); no top-level `__tests__/` or `tests/` tree
- [ ] `npm run build` succeeds with no TypeScript errors or warnings from the strict flags (`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, etc.)
- [ ] **Do not release this build to students without the deferred privacy / IRB review** (see Out of Scope). Engineering acceptance of this PR does not imply privacy clearance.

## Open Questions

### RESOLVED: Performance Log metric set (Endurance vs Strength & Power)

**Context**: The prototype's Performance Log table has a designer note in the HTML: *"Note: needs further work; do we differentiate game vs practice? What are the default sets for E vs SP? etc."* The current prototype row set (Wins/Losses, Goals, Assists, Yards, Tackles) is a placeholder and does not differentiate by athlete type.

**Options considered**:
- A) Port the current placeholder set verbatim; treat metric-set-by-athlete-type as a follow-up story.
- B) Block on designer input before porting Performance Log.
- C) Build the port against the `MetricDefinition` registry (already a decision below) and supply a single default set for now - new sets can be added by adjusting the registry once the designer commits.

**Decision**: **C** — ship with the prototype's placeholder set (Wins, Losses, Goals, Assists, Yards, Tackles) sourced from a `MetricDefinition`-shaped `PERFORMANCE_METRICS` registry under `src/metrics/performanceMetrics.ts`. Designer is mid-iteration on the per-athlete-type real sets (and will be for at least the next week as of 2026-04-28); blocking the conversion is unjustified. The registry shape isolates the swap to a single file when the designer commits — no UI changes, no migration impact for users who haven't logged data with the placeholder names yet. **Follow-up**: a separate story under DGT-5 (or DGT-29 reopened) lands the real metric sets once the designer + content team commit, including the question list drafted earlier (per-athlete-type sets, game-vs-practice differentiation, sport-level granularity, totals-column rules, addable pool, units/ranges, info copy).

## Self-Review

### Senior Engineer

#### RESOLVED: New dependencies not enumerated in package.json
The spec prescribes React Router routes, React Hook Form + Zod validation, and a drag-reorder interaction on Tracked Data Setup, but none of these libraries are in [package.json](package.json). **Resolution**: added a **Dependencies** section above Implementation Order listing `react-router-dom`, `react-hook-form`, `zod`, `@hookform/resolvers`, `@dnd-kit/core`, `@dnd-kit/sortable`. Drag library pinned to `@dnd-kit/core` because mobile is the primary form factor and its `TouchSensor` + `KeyboardSensor` + `PointerSensor` composition covers touch, keyboard, and desktop without a separate library.

#### RESOLVED: `useIsCodap()` detects any iframe, not just CODAP
`return window !== window.parent` fires for any iframe embedding, not just CODAP (dev-tool previews, unrelated embeds). **Resolution**: dropped the iframe-detection hook entirely. Plugin mode is now gated on a dedicated `/codap` route (the CODAP plugin URL we hand to CODAP is already under our control, so we can point it at `/codap` directly). Route-based gating is explicit, avoids a handshake, and has no false-positive surface. The `useIsCodap.ts` file is removed from the proposed component structure.

#### RESOLVED: `PerformanceEntry` type has an index-signature conflict
The original shape mixed versioned metadata (`version`, `date`) with a dynamic metric bag under the same index signature. Any future non-scalar field would have broken the type. **Resolution**: moved the dynamic values under a `metrics: Record<string, number | string>` property. `WellnessEntry` is left as-is because its fields are strongly typed (hydration, sleepTime, etc.) — the restructuring only applies where the shape is genuinely dynamic.

#### RESOLVED: Onboarding / Firestore-load race not addressed
Without a tri-state profile load, `ProtectedRoute` would redirect returning users to `/profile` on every cold start while the Firestore fetch is still in flight. **Resolution**: added a "Profile load state and ProtectedRoute" subsection under UserContext specifying a `ProfileLoadState` union (`loading | missing | loaded`) and the exact render/redirect rule for each state. Onboarding routes (`/profile`, `/setup/tracking`) only gate on `status !== 'loading'` so new users can reach the form and existing users can edit.

---

### WCAG Accessibility Expert

#### RESOLVED: `prefers-reduced-motion` not addressed
Ambient motion (accent-line shimmer, dashboard header slide, motivation carousel, hamburger slide-down) needs an opt-out path for users who request reduced motion. **Resolution**: added a "Reduced motion" subsection under Design System / CSS requiring both CSS opt-outs (via `@media (prefers-reduced-motion: reduce)` wrapping all decorative `@keyframes` / long transitions) and JS timer opt-outs (carousel and motivation cycle check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and hold on the first slide when matched). Essential motion like focus-visible outlines and click-feedback transforms is kept.

#### RESOLVED: Drag-reorder of tracked metrics is pointer-only
Pointer-only drag is inaccessible to keyboard and screen-reader users. **Resolution**: added a "Keyboard-accessible drag-and-drop" subsection under Design System / CSS that locks in the a11y contract: `@dnd-kit/core`'s `KeyboardSensor` is registered alongside `TouchSensor` and `PointerSensor`; drag handles are focusable buttons with `aria-label`; keyboard flow (`Space`/`Enter` pick up, arrows move, `Space`/`Enter` drop, `Escape` cancel) works without a mouse; and `DndContext.accessibility.announcements` narrates the drag state for screen readers. No extra "Move up / Move down" buttons needed because the keyboard-drag flow covers the same affordance more ergonomically.

#### RESOLVED: Charts have no accessible alternative
SVG charts are invisible to screen readers by default. **Resolution**: added a "Chart accessibility" subsection under Design System / CSS requiring `<title>` + `<desc>` inside every chart's `<svg>` (with `role="img"` + `aria-labelledby`), an adjacent visually-hidden `<table>` of date/value pairs on Metric Detail charts (with a visible "Show data" toggle), and visually-hidden per-cell labels on activity calendars (`"Nov 3, 2026: all metrics logged"`). Color-only encoding is always backed up by text or legend entries. Applies to `MetricChart`, Metric Detail's inner chart, and `ActivityCalendar`.

---

### QA Engineer

#### RESOLVED: No test framework configured, and the conversion adds ~15 components + migration layer
Shipping the full conversion with zero test coverage is risky, but full UI coverage would bloat the commit and generate throw-away tests since the UI will churn after first-user feedback. **Resolution (option C)**: stand up Vitest in this commit and cover only the data-migration chain (`migrateDocument()` + each registered migration + fixture docs at each version). UI / component tests, E2E / emulator tests, and CODAP plugin tests are deferred to a follow-up story once the UI stabilizes. Added a "Testing" section above Implementation Order documenting the scope split and the rationale.

#### RESOLVED: "Conversion complete" acceptance criteria not stated
Without a Definition of Done, the PR reviewer has to derive one by reading the whole spec. **Resolution**: added an "Acceptance criteria" section between Decisions and Open Questions with ~19 checkboxes covering routing, auth flows, existing-auth preservation, onboarding, `ProtectedRoute` tri-state, drag-reorder + keyboard a11y, CODAP route, dashboard features, `prefers-reduced-motion`, chart a11y, DGT-6 viewport matrix, PWA behavior, Firestore rules, emulator wiring, version footer bump, dependency additions, migration-test coverage, and clean TS build.

#### RESOLVED: Verification matrix absent
DGT-6's width + browser matrix is the baseline, but the new data-dense screens need explicit content-fit verification at the narrow end. **Resolution**: expanded the Acceptance criteria with the DGT-6 browser matrix (Chrome / Safari / Edge desktop + Android Chrome + iOS Safari) and a dedicated 375-px content-fit checklist covering Profile form (inline Age/Ht/Wt rows), Performance Log table, activity calendars, and dashboard chart cards. Browser matrix inherited from DGT-6 as-is.

---

### Security Engineer

#### RESOLVED: `sendEmailVerification` failures are silently swallowed
Silently swallowing the error leaves users waiting for an email they'll never receive. **Resolution**: updated the Add subsection under Integration with existing code to (1) log the error via a `logError` helper (console.error for now, telemetry-ready), (2) pass the failure state into the `EmailVerification` screen so it can surface a clear "We had trouble sending the email - tap Resend" note on failure, and (3) keep the Resend button always visible, not gated on failure state.

#### RESOLVED: Forgot-password UX should avoid user enumeration
Firebase Auth's `sendPasswordResetEmail` is server-side neutral on account existence; the UI copy needs to match or we leak whether an email is registered. **Resolution**: updated the Forgot Password bullet in the Add subsection to pin the success copy to a neutral "If an account exists for that email, we sent a reset link. Check your inbox." and explicitly forbid echoing the email address or any phrasing that would signal success vs. failure differently.

#### RESOLVED (deferred): Student PII collection — privacy review needed
Privacy / IRB review requires authority this spec doesn't have - it needs sign-off from Concord's privacy / research-ops team. **Resolution (deferred)**: added an Out of Scope section calling out "privacy / IRB review and consent workflow" as a follow-up story, with an explicit statement that *this conversion must not be released to students until that review clears*. Added a matching acceptance-criteria line so the PR-reviewer checklist and deploy gate are aware: engineering acceptance of this PR does not imply privacy clearance. Follow-up owner is Concord's privacy / research-ops team.

---

### Performance Engineer

#### RESOLVED: Bundle-size impact of the single commit not budgeted
Picking an exact target without measurement is a guess. **Resolution**: added a "Performance budget" section between Testing and Implementation Order requiring the PR to **report** gzipped initial-JS and total-precache sizes against `main` at branch point, setting a **soft budget** (initial JS <= 250 KB, precache <= 500 KB) that triggers a discussion rather than an automatic block. Originally identified three lazy-load seams (`CodapPlugin`, chart library, `@dnd-kit`); after the Fourth-pass interview decisions, only `CodapPlugin` is lazy-loaded — the chart components are placeholders (negligible bytes), and `@dnd-kit` is part of the onboarding-required path. See "Lazy-load seam — only one in scope for this conversion" in the Performance budget section.

#### RESOLVED: Font loading strategy not specified
**Resolution (option A)**: self-hosted WOFF2 files under `public/fonts/` so the existing PWA precache picks them up, Latin subset only (drops ~60% per face), only four faces shipped (Barlow 400/700, Barlow Condensed 600/800), `@font-face` uses `font-display: swap` as a first-paint fallback, and all four files are preloaded in `<head>` via `<link rel="preload" as="font" type="font/woff2" crossorigin>`. Added as a "Font loading strategy" block under Typography. Google Fonts rejected because runtime-fetched fonts defeat the PWA offline / precache story.

#### RESOLVED: No animation / frame-rate budget on low-end devices
`prefers-reduced-motion` (issue 5) already covers the a11y case. For users on low-end hardware who haven't opted out, a hard fps gate is unrealistic. **Resolution**: added to the Performance budget section (1) a **measurement requirement** - the PR description includes a Chrome DevTools performance profile of the Dashboard under 4x CPU throttling + "Slow 4G" over ~10 s spanning one motivation-message cycle, as a sanity check not a numeric gate; and (2) an **ambient-animation coordination rule** - pause the dashboard header-slide carousel while the hamburger nav overlay is open so two simultaneous animations don't compete for CPU/attention.

---

### Second pass

Surfaced by re-reviewing the spec after the 16 first-pass resolutions landed. These are gap-fills from the resolutions themselves, not new architectural concerns.

#### RESOLVED: `/codap` route interaction with ProtectedRoute not specified
`/codap` needed an explicit carve-out from `ProtectedRoute` or unauthenticated CODAP visitors would be redirected to `/login`. **Resolution**: added a sentence to the CODAP Plugin's Detection subsection stating `/codap` is not wrapped in `ProtectedRoute`, and `CodapPlugin` inspects `AuthContext.user` directly to render either the data-export UI or the "Log into DataGOAT first, then reload this plugin" message.

#### RESOLVED: `.visually-hidden` utility class is undefined
**Resolution**: added a canonical `.visuallyHidden` rule to the Accessibility primitives section (lives in [common.module.css](src/components/common.module.css), consumers import as `common.visuallyHidden`) with the standard clip-path pattern. Updated Chart accessibility examples to use `className={common.visuallyHidden}` (matching the CSS Modules convention) so there's one place to look and one way to call it.

#### RESOLVED: `logError` helper is undefined
**Resolution**: added a bullet under the Add subsection specifying the helper's location ([src/utils/logError.ts](src/utils/logError.ts)), signature (`(err: unknown, context?: Record<string, unknown>) => void`), and body (single `console.error` for this commit, TODO-marked telemetry seam). Named as the target for all non-fatal errors in auth flows so a future telemetry swap is a one-file change.

#### RESOLVED: `DataContext` needs the same load-state tri-state as `UserContext`
Same race as the profile fetch, but "no entries" is legitimate (not missing). **Resolution**: added a "Data load state" subsection under `DataContext` specifying a **bi-state** (`loading | loaded`) rather than a tri-state - the "missing" state has no meaning for log data because zero entries is a valid loaded result. Locked in the rule: consumers render a skeleton while loading; empty-state copy ("No entries logged for today") only renders after `status === 'loaded'` with `entries.length === 0`. Each data kind (wellness, performance) has its own state so partial loads render fast.

#### RESOLVED: `npm run test` script + migration-fixture location not specified
**Resolution**: added package.json scripts (`"test": "vitest run"` for CI, `"test:watch": "vitest"` for local, optional `"test:ui": "vitest --ui"`) and a spec-wide **colocation convention** in the Testing section: tests live next to the source as `foo.test.ts`, fixtures as `foo.fixtures.ts`. No top-level `__tests__/` or `tests/` tree. Vitest's default discovery picks up `*.test.ts` files anywhere under `src/`, so no config changes needed. Updated Acceptance criteria with matching checkboxes.

---

### Third pass

Surfaced after the 2026-04-27 prototype updates landed (Facebook OAuth, "Health & Wellness" rename, interactive calendar, dynamic completeness chip + legend, Lean Mass / Availability info copy, no-sliders/steppers decision, sub-44px tappable touch targets, column max-width 640→440px, motion tokens, iconography strategy). Same gap-fill review as Second pass, scoped to the new content.

#### RESOLVED: Facebook account-collision UX not specified
Adding Facebook OAuth surfaces `auth/account-exists-with-different-credential` when a Facebook user's email already exists under another provider (most often: a user signed up with email/password using `eli@example.com`, later tries "Continue with Facebook" with the same email). Firebase Auth throws and leaves the user stranded; the existing `authErrorMessages` table doesn't yet cover this case. **Resolution (initial — superseded by the Fourth pass below)**: extend the table with a friendly-but-actionable message ("This email is already registered with a different sign-in method. Sign in with your existing method, then link Facebook from your profile.") and treat the linking flow as out of scope. Pinning the message now means the failure mode is graceful, not silent. **Superseded**: account-linking is now in scope — see Fourth pass "RESOLVED: Account-linking flow now in scope (was deferred)" below.

#### RESOLVED: Facebook OAuth may return no email
Facebook lets users deny the `email` scope. Firebase still creates a User record, but `user.email` is `null`. Profile bootstrap assumes `user.email` exists (it's the seed for `ProfileForm.email`). **Resolution (initial — superseded by the Fourth pass below)**: add a client-side fallback in the OAuth-success handler — if `user.email == null` after Facebook sign-in, route the user to the email-verification screen with copy "We need your email address to finish creating your account" and a manual email field. The user fills it in and `sendEmailVerification` is sent to that address. **Superseded**: missing-email is now rejected server-side by a `beforeUserCreated` Cloud Function blocking trigger before the user record is created — see Fourth pass "RESOLVED: Facebook missing-email handled server-side (was client-side fallback)" below.

#### RESOLVED: OAuth popup-blocked / user-cancelled errors not routed through `logError`
The Add subsection in Integration with existing code already specifies `logError` for `sendEmailVerification` and `sendPasswordResetEmail` failures. OAuth `signInWithPopup` rejections (`auth/popup-blocked`, `auth/popup-closed-by-user`, `auth/cancelled-popup-request`, `auth/network-request-failed`) need the same treatment for consistency. **Resolution**: extend the bullet to call out OAuth (Google + Facebook) popup-flow rejections as targets for `logError`. User-cancelled (`auth/popup-closed-by-user`) should log at debug level (or be filtered upstream when telemetry lands) since it's a normal user action, not a fault.

#### RESOLVED: Sub-44px tappable calendar cells need a concrete re-test commitment
The Decisions section acknowledges the touch-target trade-off and lists compensating affordances, but "if testing surfaces accuracy issues we'll revisit" is too soft to act on. **Resolution**: pin the field-test contract — content team logs at least 5 sessions of real users tapping cells across multiple days, recording mis-tap rate (taps that hit the wrong cell or miss entirely). Threshold for revisiting: > 15% mis-tap rate, or any user feedback citing the size as a barrier. If triggered, the follow-up options are (a) increase cell tap area via invisible padding (`::before` with negative offsets, like the prototype's `.section-cal-nav-btn::before`), (b) add a long-press confirmation, or (c) drop the interactive cell and add an explicit "Jump to date" picker as the entry point. This story does not block on the field test; it lands the interaction with the trade-off documented.

#### RESOLVED: Dynamic chip is color-only encoding for sighted users
The Health & Wellness Log date-nav chip conveys completeness state (All / Some / None) via three colors only. Screen readers see the legend text below ("Data entered: All / Some / None"), but sighted users with deuteranopia / protanopia could mistake "Some" (`#007A84`) for "All" (`var(--accent)` = `#00B3C0`) since both are teal-family. **Resolution**: keep the chip color-coded (matches prototype) but supplement with a **shape variation**: All = solid filled square, Some = filled square with a small diagonal stripe overlay, None = empty square with border (already the case). The stripe is added via `linear-gradient` background and is purely decorative for screen readers. This costs ~5 lines of CSS, adds no markup, and gives color-blind users a non-color cue. If the designer pushes back on the visual, fall back to keeping the chip color-only and increasing legend prominence (e.g., make "Data entered:" + the swatches always-visible at the top of the log, not just under the date nav).

#### RESOLVED: Calendar-tap navigation rule for offset preservation not pinned
The 2026-04-27 prototype JS contains a subtle UX rule: navigating to `wellness-log-screen` resets the offset to today (`HISTORY = 29`) **unless** arrival was via a calendar-day tap, in which case the tapped-date offset is preserved (`window._calNavOverride` flag). This rule will be lost in the React port if not pinned. **Resolution**: add a sentence to the ActivityCalendar component description and a parallel sentence to the WellnessLog/DateNav description specifying the rule: "Direct navigation to `/wellness` (hamburger menu, dashboard CTA, return from MetricDetail) defaults the date to today. Navigation via calendar-cell tap preserves the tapped date." Implementation note: pass the date as a route param (`<Navigate to={\`/wellness/${dateString}\`} />` or via a search param) rather than a context flag; React Router state is the correct primitive here, not a window global.

#### RESOLVED: Inactive-cell + future-date filtering for tappable calendar cells not enumerated
"Non-inactive day" was used in the spec as shorthand. The prototype's actual filter is two conjoined rules: (1) cell `state !== I` (inactive), and (2) the cell's calculated `offset` is in `[0, HISTORY]` (i.e., not before the user's first tracked day, not after today). **Resolution**: enumerate both filters in the ActivityCalendar component description: cells outside the active window are visually rendered as inactive (no hover/focus indicator, no tabindex, no role="button") and click handlers are no-ops. Future dates in particular must not be tappable - they have no log to navigate to and would dead-end the user.

#### RESOLVED: 440-px content-fit not in the acceptance-criteria checklist
The 375-px content-fit checklist was already in the spec, and 375 < 440 so most of those checks still hold. But narrowing the column from 640 → 440 means content that previously had room to breathe at 440 (because the column was actually 640) is now constrained. The dashboard chart cards in particular were validated visually in the prototype (which renders at 360-440), so they should fit, but the acceptance-criteria checklist should explicitly list 440 as a verification width alongside 375. **Resolution**: extend the existing 375-px checklist into a "375 / 440" checklist and re-run the same content-fit checks (Profile inline rows, Performance Log table, activity calendars, dashboard chart cards) at both widths. 440 is the "happiest path" since that's where the designer worked; 375 is the narrowest real-device guard.

#### RESOLVED: Calendar-tap navigation - URL-encoded date vs. component state
The prototype passes the tapped date through a window-global flag (`_calNavOverride` + `_setDlOffset`). **Decision (option A)**: URL search param `/wellness?date=2026-04-15`. WellnessLog reads the date from `useSearchParams()`, falls back to today when the param is absent. DateNav prev/next mutates the search param. ActivityCalendar links via `<Link to={\`/wellness?date=${iso}\`}>`. Direct navigation (hamburger / dashboard CTA / back from MetricDetail) routes to `/wellness` with no `?date=...`, which falls back to today. Benefits: browser back/forward works naturally, refresh preserves the date, and links to a specific log day are shareable. Path-param (`/wellness/:date?`) was rejected as an unnecessary optional-segment route variant; pure component/context state was rejected because it loses the back/forward + refresh + share affordances for no implementation savings worth the trade.

#### RESOLVED: Animation-token preservation under reduced motion
The Motion tokens subsection added `--dur-tap`, `--dur-quick`, `--dur-base`, `--dur-carousel-x/-o`, plus easing tokens. The Reduced motion subsection requires opting out of "decorative / ambient motion" via `@media (prefers-reduced-motion: reduce)`. The two interact: `--dur-tap` (100ms) is essential motion (tap-feedback), not decorative, and should NOT be zeroed under reduced-motion; `--dur-carousel-x/-o` (the dashboard header signature animation) IS decorative and should be. **Resolution**: add a one-paragraph rule to the Reduced motion subsection: "Essential motion tokens (`--dur-tap`, `--dur-quick` for hover/focus indicators) remain active under `prefers-reduced-motion`. Decorative motion tokens (`--dur-carousel-x`, `--dur-carousel-o`, `--ease-bounce`, `--ease-accel`, the named keyframes `accent-shimmer` and the header carousel) are zeroed via `@media (prefers-reduced-motion: reduce)`." This makes the opt-out policy mechanical: a reviewer can grep for each token and check whether its consumers are wrapped in the media query.

---

### Fourth pass

Surfaced after follow-up review of the auth flows raised two scope expansions: (1) Facebook missing-email needs server-side rejection (not a client-side fallback), (2) duplicate-account collisions need a real linking UI (not a deferred "out of scope" message).

#### RESOLVED: Facebook missing-email handled server-side (was client-side fallback)
The Third pass resolved Facebook missing-email with a client-side fallback: detect `user.email == null` after `signInWithPopup`, route to the EmailVerification screen with a manual email field, call `updateEmail` + `sendEmailVerification`. This is bypassable by a malicious client (just don't route to the fallback) and creates orphaned `null`-email user records when the flow is interrupted. **Resolution**: replace the client-side fallback with a Firebase **`beforeUserCreated` Cloud Function blocking trigger** that throws `HttpsError('invalid-argument', '...')` when the provider data includes `facebook.com` and `event.data.email` is missing. The user record is never created; the client receives `auth/internal-error` carrying the thrown message and surfaces it inline on the auth screen. The fallback EmailVerification mode is removed. **Prerequisite**: Firebase project must be upgraded from "Firebase Auth" to "Identity Platform" (one-time admin action; free tier through 50K MAU). Implementation lives under `functions/src/auth/blockFacebookMissingEmail.ts` with unit tests and emulator coverage; see the Implementation Spec for the dedicated step. The Third pass entry "Facebook OAuth may return no email" is marked superseded.

#### RESOLVED: Account-linking flow now in scope (was deferred)
The Third pass resolved `auth/account-exists-with-different-credential` with a friendly error message ("Sign in with your existing method, then link Facebook from your profile") and treated the linking flow itself as out of scope. The deferred message references a Profile-screen flow that doesn't exist yet, leaving users with no way to actually link providers. **Resolution**: implement the inline linking flow now, sign-in-time only. When `auth/account-exists-with-different-credential` fires, LoginForm/SignupForm catches the error, calls `fetchSignInMethodsForEmail(email)` for the existing provider, extracts the pending Facebook credential via `FacebookAuthProvider.credentialFromError(error)`, and flips the screen to a linking-mode view (component-local state — no separate route). The linking view tells the user "This email is registered with [Google / email]. Sign in to link Facebook to your account." and renders the appropriate sign-in UI. On success, `linkWithCredential(currentUser, pendingCredential)` attaches Facebook to the existing account and the user lands on `/dashboard`. Pending credential lives in component-local state (not sessionStorage); refreshing during the flow restarts it. **Out of scope**: a Profile-screen "Linked Accounts" section for after-the-fact provider management — sign-in-time linking only. Reference: https://firebase.google.com/docs/auth/web/account-linking. The Third pass entry "Facebook account-collision UX not specified" is marked superseded.
