# DataGOAT Prototype to React Conversion

**Status**: **Closed**

## Preface

This document describes the original prototype-to-React conversion as it shipped. It is preserved as a historical record of the decisions, scope, and trade-offs made during that conversion. Subsequent work has changed parts of the app the conversion delivered; rather than rewriting this document in place, the major divergences are listed below so readers can map old terminology onto the current codebase.

**Changes since the conversion**

- **User-defined custom metrics** (DGT-36) — users can add their own metrics alongside the built-in registries. The `HEALTH_METRICS` / `COMPETITION_METRICS` registries described below are now augmented at runtime by entries from the `customMetrics` Firestore collection; the dashboard, log, and tracked-setup screens all merge built-ins with customs.
- **Metric-category rename** (DGT-37) — the two categories were rebranded:
  - "Health & Wellness" → "Health & Performance" (visible label); `wellness` → `health` (identifier).
  - "Performance" → "Competition" (visible label); `performance` → `competition` (identifier).
  - Routes `/wellness` → `/health` and `/performance` → `/competition` (and their `:metricId` and `/add-metric/...` variants).
  - File renames: `WellnessLog.tsx` → `HealthLog.tsx`, `PerformanceLog.tsx` → `CompetitionLog.tsx`, `wellnessMetrics.ts` → `healthMetrics.ts`, `performanceMetrics.ts` → `competitionMetrics.ts`, plus the `migrations/` and `utils/` siblings.
  - Firestore collections `wellnessEntries` / `performanceEntries` → `healthEntries` / `competitionEntries`; profile fields `trackedWellnessMetrics` / `trackedPerformanceMetrics` → `trackedHealthMetrics` / `trackedCompetitionMetrics`.

When in doubt, the codebase is the source of truth; this document is the source of truth for *why* the original shape was chosen.

## Overview

Convert the DataGOAT designer prototype (a single-page HTML / vanilla-JS mockup) into the production React 19 + Vite + Firebase app, replacing the current wireframed auth shell with the full 11-screen flow — auth, profile, tracked-data setup, dashboard, daily wellness/performance logs, metric detail, add-metric, info modals, and a CODAP plugin view. Ships in one atomic PR alongside three React contexts (Auth / User / Data), a lazy-on-read Firestore migration layer, a Cloud Function that blocks Facebook signups missing an email, the prototype's dark-theme design system, and the routing + onboarding flow. Real chart rendering and per-athlete-type Performance Log metrics are deferred to tracked follow-ups; this PR ships placeholders that pin the API and accessibility contracts so the swap is purely visual.

DataGOAT is a personal-data tracking app for student athletes. Users log daily wellness metrics (hydration, sleep, protein, lean mass, availability) and performance metrics (sport-specific counters), then view trends and goal comparisons on a dashboard, with an optional export to CODAP for deeper analysis. The conversion lands the app shape (auth + onboarding + log + dashboard + CODAP plugin), the design system (dark theme, fonts, motion tokens, focus indicators), and the data layer (Firestore + per-document version migrations + a server-side blocking trigger that prevents orphan Facebook accounts without an email address). The conversion ships as a single atomic PR rather than phased increments because partial conversions in `main` are a worse review burden than the full bundle, and per-step commits keep individual diffs reviewable inside the PR.

## Requirements

The PR reviewer can use this list as a Definition of Done.

- All 11 screens reachable via React Router: auth-shell split across `/login`, `/signup`, `/forgot-password`, `/verify-email`; plus `/profile`, `/setup/tracking`, `/dashboard`, `/wellness`, `/wellness/:metricId`, `/performance`, `/performance/:metricId`, `/add-metric/:type`, `/info/:topic`, `/about`, `/codap`
- Auth flows functional against the Firebase Auth emulator: email/password sign-in, Google OAuth sign-in, Facebook OAuth sign-in, registration, forgot-password email send, email-verification send + resend, sign-out
- Both `LoginForm` and `SignupForm` show "Continue with Google" + "Continue with Facebook" social buttons above the email/password form, separated by an `or` divider; trusted-provider OAuth users (Google, Facebook with email) skip the verification screen and banner via `isEmailVerifiedOrTrustedProvider`; `auth/account-exists-with-different-credential` triggers the inline account-linking flow (LoginForm/SignupForm flips to linking mode and shows both Google and email/password options — no `fetchSignInMethodsForEmail` lookup); on success calls `linkWithCredential(result.user, pendingCredential)` to attach the pending Facebook credential; OAuth popup-flow rejections route through `logError`
- `beforeUserCreated` Cloud Function blocking trigger rejects Facebook sign-in attempts where `email` is null/missing. Lives under `functions/src/auth/blockFacebookMissingEmail.ts`, has unit tests, runs against the Firebase Functions emulator, deploys via `npm run deploy:functions`. Firebase project upgraded to Identity Platform (deployment prerequisite documented in CLAUDE.md). Client maps the resulting `auth/internal-error` to the `[BLOCKED_NO_EMAIL]`-sentinel-stripped message and surfaces it inline. `FACEBOOK_BLOCKER_ENABLED` runtime parameter is the kill switch
- User-facing label "Health & Wellness Log" replaces "Wellness Log" everywhere it appeared in the previous prototype (screen heading, dashboard section heading, hamburger menu item, dashboard log CTA, "Add Health & Wellness Metric" page title, status messages, aria-labels). Internal identifiers (route `/wellness`, component names, Firestore collection names) keep the `wellness` shorthand
- Health & Wellness dashboard calendar cells are interactive only when both filters pass (`state !== inactive` AND offset is in `[0, HISTORY]`); future-dated cells are explicitly non-interactive. Tappable cells render as a plain `<Link to="/wellness?date=YYYY-MM-DD">` (no `role="button"`, no synthetic Space handler, no explicit `tabindex`); Enter activates natively. Direct navigation to `/wellness` falls back to today via `?date=` search param. Performance calendar cells remain non-interactive in this story. Visible hover/focus indicator on tappable cells; `:focus-visible` uses `var(--focus-ring)`
- Health & Wellness Log date nav renders a dynamic completeness chip + "Data entered: All / Some / None" legend. Chip uses **color + shape** (All = solid, Some = striped, None = empty bordered) so the cue is not color-only. Chip updates synchronously per keystroke as the user enters/clears data on that date. Performance Log date nav stays label-only (no chip/legend)
- Health & Wellness Log + Performance Log inputs are plain numeric text fields - no sliders, steppers, or +/- controls
- Preserved auth logic from existing `Login.tsx`: handlers and `authErrorMessages` map (extended; `registeredDisplayName` bridge dropped because SignupForm no longer collects displayName)
- New-user onboarding flow reaches Dashboard through Profile -> Tracked Data Setup; hamburger menu is disabled until `profileComplete && trackingSetupComplete`
- `ProtectedRoute` uses the four-state `ProfileLoadState` (`loading | missing | loaded | error{kind: 'subscription' | 'migration'}`); returning users are not kicked to `/profile` while the Firestore fetch is in flight; `error` renders a kind-aware retry UI that does NOT redirect (prevents onboarding submit clobbering a real or unmigrated profile via `setDoc(merge:true)`). `OnboardingRoute` uses the same gates but renders the form on `'missing'` instead of redirecting
- Tracked Data Setup rows render a drag handle, a Track checkbox, the metric name, and a per-metric info button (no edit toggle, no delete column — pinned design deviation from the prototype HTML); drag-reorder works via `@dnd-kit/core` wired with `TouchSensor` + `KeyboardSensor` + `PointerSensor`; keyboard drag narrates via `announcements`; KeyboardSensor binds both `Space` and `Enter` to start/end
- CODAP plugin view renders at `/codap` route (no iframe detection — route-based gating); plugin view skips mobile container, PWA registration, hamburger, version footer; runs its own `signInWithPopup`-based sign-in flow because storage partitioning prevents the iframe from inheriting the top-level session; iframe-aware redirect bounces top-level `/codap` visits to the CODAP-wrapped URL; `?noredirect=1` is the dev escape hatch
- Dashboard includes: header slide + motivation carousel (asymmetric hold timings — wordmark 6750ms, motivation 9000ms; goat-tap-to-advance always available), wellness activity calendar, log-status CTA buttons, two chart cards with time-range picker (7d / 2w / 30d / 3mo / 6mo / All), "Analyze Your Data in CODAP" button. Charts are placeholder gray-box components at the final dimensions accepting the full final prop surface *(deferred — see Not Yet Implemented)*. Performance section omits its calendar per prototype HTML 4170-4225
- All `@keyframes` / long transitions and JS carousel timers honor `prefers-reduced-motion`; carousel pauses when hamburger menu is open via `NavMenuContext`
- Every chart component exposes `title` + `description` as `<title>`/`<desc>` inside `role="img"` SVGs; Metric Detail charts have a fully working visually-hidden adjacent data table with a "Show data" toggle; activity calendars have visually-hidden per-cell labels using short-month form ("Nov 3, 2026: all metrics logged")
- Mobile container structure preserved with the column **narrowed from 640px to 440px** to match the prototype (two-tier height: `100dvh` below 1024px, `95dvh` centered at >=1024px; landscape-phone collapse, `box-sizing` reset, `tabIndex={0}` keyboard-scroll on `<main>`) and the visible surround removed (no body/column background differentiation, no column border, no drop shadow). `<main>`'s `:focus-visible` outline uses `var(--focus-ring)`. Verified at viewport matrix (375 / 414 / 439 / 440 / 896 / 1023 / 1024 / 1440 px) in Chrome / Safari / Edge desktop, Android Chrome, iOS Safari
- Content-fit verification at both 375px (narrowest real device) and 440px (column max) for data-dense screens (Profile inline rows, Performance Log table, activity calendars, dashboard chart cards)
- PWA auto-update behavior preserved: NetworkFirst for HTML, cache warming on first visit, SW update check on `visibilitychange`, auto-reload on `controllerchange`
- `firestore.rules` cleaned up to a single user-level wildcard rule (`/users/{userId}/{document=**}`, owner-only); legacy `/config/**` block dropped. All DataContext paths fall under the user rule
- Firebase emulator wiring in `firebase.ts` extended with `connectFirestoreEmulator`; `npm run emulators` extended to include functions
- Firestore initialized with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` so offline writes queue durably to IndexedDB and replay on reconnect
- Version display moved off `App.tsx` (sticky footer removed) and onto the About screen as a muted footer line, with `APP_VERSION`/`APP_VERSION_DESC` bumped and a build timestamp injected via Vite (`import.meta.env.VITE_BUILD_TIME`)
- Skip-to-main link in both `AppShell` (`<header>` is sibling of `<main id="main-content" tabIndex={0}>`, structurally bypassing header chrome including the hamburger trigger) and `AuthLayout` (form-area slot has `id="main-content"` + `tabIndex={-1}` so anchor jump lands focus). Skip-link target excludes section-heading chrome buttons via a `data-skip-link-exclude` attribute
- Document-level `focusin` listener auto-scrolls focused elements into view below sticky chrome (load-bearing for keyboard navigation through dense screens)
- Shared `<Dialog>` primitive (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trap, focus return, Escape, backdrop click, reduced-motion-wrapped enter/exit). Two variants: `centered` (used by `MobileCodapModal`) and `topSheet` (used by `HamburgerMenu`). Backdrop is `position: absolute` so it scopes to its parent (no document body-scroll-lock)
- Form fields wire `aria-describedby` to error and hint regions; error `<p>` gets `role="alert"`; PasswordField eye toggle gets `aria-label` + `aria-pressed`; RadioGroup wires `aria-describedby` on the `<fieldset>` rather than per-radio
- VerificationBanner uses `role="status"` (implies `aria-live="polite"`); dismiss button has `aria-label="Dismiss verification reminder"`; mounts as the first child of `<main>` (not sticky); per-uid dismissal stored in localStorage; refreshes hourly + on `visibilitychange` so a long-running PWA can cross the 7-day threshold mid-session
- DateNav prev/next buttons get `aria-label="Previous date"`/`"Next date"` and `disabled` at boundary dates (offset 0 / HISTORY); ActivityCalendar window-scroll buttons get `aria-label="Show earlier weeks"`/`"Show later weeks"`
- All glyph icons imported via `vite-plugin-svgr` from `src/icons/` (`?react` query); SVGR template injects `aria-hidden="true"` on every generated `<svg>`; brand SVGs (datagoat / google / facebook) imported as URLs from `public/icons/` and rendered via `<img>`; auth-screen DataGOAT logo preloaded via `<link rel="preload" as="image">`. Icon-only buttons carry `aria-label` on the button, not the icon
- Self-hosted fonts in `public/fonts/`: four Latin-subset WOFF2 faces (Barlow 400, Barlow 700, Barlow Condensed 600, Barlow Condensed 800). Two faces preloaded above the fold (Barlow Regular for body + buttons, Barlow Condensed Extrabold for the wordmark); the other two load via `@font-face` with `font-display: swap`. PWA precache covers all four regardless of preload tags
- Vitest + React Testing Library + jsdom set up; `test`/`test:watch`/`test:ui` scripts in package.json
- Tests and fixtures colocated with the source (`foo.test.ts`, `foo.fixtures.ts` next to `foo.ts`); no top-level `__tests__/` or `tests/` tree
- Migration-chain unit tests cover `migrateDocument()`, each registered migration, and a per-doc-type "no version" (legacy) fixture
- `firestoreDocs.test.ts` covers the migration error contract: throwing migration → caller receives `null` and `logError` is called with `{ docPath, fromVersion }`
- Component tests for state-machine logic (~10 RTL test files) covering Dialog focus trap, OAuth result branching + linking flip, VerificationBanner threshold + per-uid dismiss, ProtectedRoute/OnboardingRoute tri-state, ProfileForm mode derivation, HamburgerMenu narrowed `isOnboarding`, WellnessLog accumulator behavior + search-param fallback, ActivityCalendar tappable filter + memo invariant, DashboardHeaderSlide interval gating
- `npm run build` succeeds with no TypeScript errors or warnings from strict flags (`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`)
- Bundle-size report (`tools/bundle-size-report.mjs`, `npm run report:bundle`) emits a markdown table with gzip + brotli columns for initial-JS and total-precache; soft budgets are gzipped initial JS ≤ 250 KB and total precache ≤ 500 KB (exceeding triggers a discussion, not an automatic block); revisit `@dnd-kit` first if blown
- Performance profile capture: PR description includes a Chrome DevTools profile of `/dashboard` under 4× CPU + Slow 4G for ~10s spanning one motivation cycle (sanity check, not a numeric gate)
- `logError` helper at `src/utils/logError.ts` always `console.error`s; in production, additionally calls `logEvent(analytics, 'app_error', ...)` with the call wrapped in try/catch and gated on `isSupported()`; lazy-initialized Analytics seam in `firebase.ts` (resolves to `Analytics | null`); `VITE_FIREBASE_MEASUREMENT_ID` placeholder in `.env.example`
- Do not release this build to students without the deferred privacy / IRB review *(see Out of Scope)*. Engineering acceptance does not imply privacy clearance

## Technical Notes

### App shape

- Three React contexts (`AuthContext`, `UserContext`, `DataContext`) avoid prop drilling
- `AuthContext` is auth-only: `{ user, loading, isEmailVerified, signOut }`. `isNewUser` is derived in `UserContext` from the absence of a Firestore profile; `daysUnverified` is computed inside `VerificationBanner` (refreshed hourly + on `visibilitychange`) so a long-running PWA crosses the 7-day threshold mid-session
- `UserContext` exposes a four-state `ProfileLoadState`: `loading | missing | loaded | error{kind: 'subscription' | 'migration'}`. Migration failures on the singleton profile doc map to `error{kind: 'migration'}` (NOT `'missing'`) so route guards never let onboarding submit clobber an unmigrated profile
- `DataContext` uses a bi-state per data kind (`loading | loaded`) — "no entries" is a legitimate loaded state, not missing. Both kinds load independently so partial loads render fast
- `DataContext` owns the optimistic-state accumulator (lifted from per-instance log accumulators). Each keystroke synchronously merges into a `pendingMap` (one map per collection, keyed by date) and schedules a 500ms debounced Firestore write per date. Pending state is reconciled against `onSnapshot` snapshots via field-level deep equality (`availability`, `performance.metrics`); cache snapshots with `metadata.hasPendingWrites === true` are skipped to avoid reconciling against our own un-acked writes. Pending entries store the queued uid so a late-firing flush after sign-out is rejected by Firestore rules (defense-in-depth)
- `WellnessLog` and `PerformanceLog` are thin: read `currentEntry` from `useData()` (includes optimistic overlays) and call `setWellnessEntry(date, partial)` per keystroke. No local debounce machinery
- `MetricInputRow`'s `NumericInput` holds raw keystrokes in local string state so users can type `"1."`, `"0"`, `"07"` without round-trip stripping. External prop changes are accepted only when they don't round-trip to the user's current local string
- Migrate-on-read, persist-on-write: `readDoc` runs `migrateDocument()` in memory; old Firestore documents are upgraded lazily on the next write. `readDoc` wraps `migrateDocument` in try/catch — on throw, calls `logError(...)` and returns `null` (loud in logs, soft in UI; UserContext maps that to `'missing'` for collection docs but the singleton profile uses `'error'`)
- Empty-entry factories (`emptyWellnessEntry(date)`, `emptyPerformanceEntry(date)`) live in `src/types/data.ts` and are version-stamped at the factory; both DataContext (for optimistic-merge bases) and the log components consume the same factory
- Three-state slide machine in `DashboardHeaderSlide`: each slide has default (off-screen right), `.active` (center), and `.exitLeft` (off-screen left, ~650ms). Without resetting just-exited slides back to default, alternation direction flips on every other cycle
- `MotivationMessage` initial index is `-1` (not `0`) so the first inactive→active transition advances to index 0 (the streak greeting); a module-scope index cursor keeps rotation surviving `/dashboard` remounts within a page-load. Name fallback chain is `nickname || fullName.split(' ')[0] || '(name)'` (load-bearing for half-completed profiles and Day-1 demos)
- Color-swatch picker (Hydration) implements arrow-keys-and-select-in-one-step keyboard contract; pressing 1..N jumps directly to that swatch; each swatch is a `<button>` with `aria-pressed` + `aria-label="Hydration: N of 8"`-style description
- AvailabilityTree uses inline `<label>` + `<input type=radio>` pairs (NOT wrapped in RadioGroup fieldsets — verbatim port of prototype semantics). Open/closed sub-row state is CSS-only via `.avail-option.open`
- `getCompTermLabel(term, abbreviated?)` helper in `src/data/competitionTerms.ts` ports the prototype's term abbreviation map verbatim (e.g., `'tournament' → 'Tourn.'`)
- `PerformanceTotals` sums over the visible HISTORY (30-day) window, matching the date-nav range so the totals column is consistent with the rest of the screen
- Native HTML `<select>` is used for SelectField — the prototype's `.custom-select` dropdown family (with arrow-key nav and direction-flip) is intentionally NOT ported
- ProfileForm renders email as read-only "Signed in as ..." muted text (NOT in an editable input). Re-collecting password is dead UI; re-collecting email without `updateEmail()` re-auth would be misleading. On submit, the auth email is copied into the Firestore profile.email for self-containment
- Profile age/height/weight inputs use `<input type="number" min="0">` with no upper bound — relaxed from the prototype's text+pattern+maxlength approach because real-world athletes can fall outside any fixed range
- ProfileForm submit does two writes in sequence: Firebase Auth `updateProfile({ displayName })` (best-effort, logged on rejection but non-fatal) then Firestore `useUser().updateProfile(...)` (canonical). Onboarding submit explicitly omits `trackedWellnessMetrics` / `trackedPerformanceMetrics` / `trackingSetupComplete` (defense-in-depth so a regression that lets a returning user reach this form via stale load state can't clobber tracking selections)
- `MetricDetail` for unknown `:metricId` redirects to the parent log (`/wellness` or `/performance`) with `replace`. No dedicated 404 view
- Hamburger menu's narrowed `isOnboarding` derivation: `'missing' → true`; `'loaded' → !profileComplete || !trackingSetupComplete`; `'loading' → false` (don't gate the menu before profile resolves; flash of disabled items would be more disruptive)

### Routing

- `/login`, `/signup`, `/forgot-password`, `/verify-email`
- `/profile`, `/setup/tracking` (gated by `OnboardingRoute`, plus `/info/:topic` so onboarding users can reach info screens)
- `/dashboard`, `/wellness`, `/wellness/:metricId`, `/performance`, `/performance/:metricId`, `/add-metric/:type`, `/about` (gated by `ProtectedRoute`)
- `/codap` lives at the top level of `<Routes>` as a sibling of the AppShell layout route (NOT a child) — route-tree position is what excludes it from AppShell. Lazy-loaded via `React.lazy(() => import('@/codap/CodapPlugin'))`
- AppShell renders, in order: skip-to-main link, `<header>` (containing `<AppHeader />` or `<DashboardHeaderSlide />`), `<main id="main-content" tabIndex={0}>` containing the `<VerificationBanner />` followed by the route's `<Outlet />`, and `<HamburgerMenu />` (mounted INSIDE `<main>`, not as a sibling, so the menu's backdrop scopes to the content area and the AppHeader stays visible above it)

### Auth

- Trusted-provider OAuth (Google + Facebook with email) is treated as verified-equivalent. Single source of truth: `isEmailVerifiedOrTrustedProvider(user)`. Adding a third provider is a one-line change to `TRUSTED_OAUTH_PROVIDERS` in `authProviders.ts`
- Inline account-linking flow when `auth/account-exists-with-different-credential` fires: LoginForm/SignupForm flips to component-local `mode='linking'` (no separate route). The panel shows BOTH a Google button AND an email/password form (email locked) — no `fetchSignInMethodsForEmail` lookup, since exposing existing methods to an unauthenticated client leaks account existence + provider. On success, `linkWithCredential(result.user, pendingCredential)` (the user from the just-resolved sign-in promise — NOT `auth.currentUser`)
- Facebook missing-email handled server-side by a `beforeUserCreated` blocking trigger (Firebase Identity Platform required). Error message uses the `[BLOCKED_NO_EMAIL]` sentinel so the client is robust to copy edits and SDK wrapping changes. Cloud Function is the single source of truth for the user-facing copy — no `authErrorMessages` entry
- ForgotPassword uses neutral copy (`"If an account exists for that email, we sent a reset link..."`) regardless of result — no user enumeration. Errors that could leak existence (`auth/user-not-found`, `auth/too-many-requests`) bucket into the same neutral confirm screen; only `auth/network-request-failed` surfaces inline
- `auth/popup-blocked` copy is self-diagnosing for in-app webviews ("If you're using Private Browsing or an in-app browser like the one inside Instagram or Facebook...")
- `signInWithRedirect` is intentionally NOT used — the redirect handler depends on third-party storage that's now partitioned away in cross-site iframes
- `EmailVerification` reads `useLocation().state?.sendFailed` (transient one-shot signal from SignupForm; intentionally NOT URL-bound) to switch between the happy "we sent a link" copy and the "couldn't send — tap Resend" copy. Resend button is always visible

### CODAP plugin

- Plugin mode is gated on the `/codap` route, not iframe detection. `useIsCodap()` hook is intentionally absent
- `main.tsx` does iframe-aware redirect for top-level `/codap` visits via `window.location.replace(buildCodapWrappedUrl())`, runs BEFORE `createRoot()`, with `?noredirect=1` as the dev escape hatch. Detection uses `window.self !== window.parent` (NOT `window.top`, to avoid cross-origin SecurityErrors). False-positive (top looks framed) → no redirect = pre-redirect behavior; false-negative (framed looks top) → one redirect cycle that self-corrects
- Plugin runs its own `signInWithPopup`-based sign-in flow because storage partitioning (Chrome SP, Firefox dFPI, Safari ITP) keys IndexedDB by `(top-level site, embedded site)`, not by embedded origin alone — the iframe's storage bucket is partitioned away from the top-level DataGOAT tab's session
- After sign-in, if `isEmailVerifiedOrTrustedProvider(user) === false` (password user with `emailVerified=false`), the plugin signs the user back out and shows a "verify your email at datagoat.concord.org" notice
- "Sign up" / "Forgot password" links open `${origin}/signup` and `/forgot-password` in a new top-level tab — onboarding and password-reset live in the main app and are not duplicated
- CODAP data-context naming: hyphen-cased identifiers (`DataGOAT-Wellness`, `DataGOAT-Performance`). CODAP's resource paths use bracket notation; spaces or `&` break the parser and items land in a phantom context that no table renders. Each context contains a single flat collection (`Wellness` or `Performance`); a `createTable` call (attached to the context, not the collection) is required to surface a UI table
- `CodapButton` on dashboard opens the wrapped URL directly (saves ~200-500ms vs going through `/codap` and the redirect). Mobile (< 640px) opens a modal pointing the user to desktop. Both paths share `buildCodapWrappedUrl()` for one source of truth
- `CodapDatasetSelector` is folded directly into `CodapPlugin.tsx` (no separate component file); date-range picker is deferred (writes the entire HISTORY window for now)

### Theme + design

- Adopt the prototype's dark theme. Color tokens (`--bg`, `--accent`, `--text`, etc.) are extracted into `:root` in `src/index.css`. Add `--accent-dark: #007A84` for the chip's "Some" diagonal stripe
- Motion tokens (`--dur-tap`, `--dur-quick`, `--dur-base`, `--dur-carousel-x`, `--dur-carousel-o`) and easing tokens (`--ease-default`, `--ease-out`, `--ease-in-out`, `--ease-bounce`, `--ease-accel`). Component CSS Modules reference tokens, not raw values. Material's `cubic-bezier(0.4,0,0.2,1)` (used only on the stripped phone-shell resize) is NOT ported
- Reduced-motion policy: essential tokens (`--dur-tap`, `--dur-quick`) remain active; decorative tokens + named keyframes (`accent-shimmer`, header carousel) are zeroed via `@media (prefers-reduced-motion: reduce)`. JS timers (`DashboardHeaderSlide`, `MotivationMessage`) check `window.matchMedia(...)` at schedule time and short-circuit when matched; goat-tap-to-advance is the manual-advance affordance under reduced motion
- CSS Modules camelCase-in-CSS convention (`.ctaBtn`, not `.cta-btn`) so JSX consumers reference as `css.ctaBtn` without bracket access
- Drag-reorder a11y: `KeyboardSensor` registered alongside `TouchSensor` and `PointerSensor`; both `Space` and `Enter` bound to start/end; `Escape` cancels; `DndContext.accessibility.announcements` narrates pickup / over / dropped / canceled events

### Build + deploy

- Path alias `@/*` configured in both `tsconfig.app.json` (`paths`, no `baseUrl` — TypeScript 7.0 deprecates it) and `vite.config.ts` (`resolve.alias`). Vite drives runtime resolution; tsconfig keeps the language server quiet
- `import.meta.env.VITE_BUILD_TIME` injected via Vite `define` (compile-time constant, no runtime cost) and rendered on the About screen as a build timestamp
- SVGR config: `svgr({ svgrOptions: { svgProps: { 'aria-hidden': 'true' } }, include: '**/*.svg?react' })` — no custom template needed
- `npm run deploy` ships hosting + functions + Firestore rules in lockstep (`firebase deploy --only hosting,functions,firestore:rules`). Standalone `deploy:functions` stays as a kill-switch-flipping convenience. Self-enforcing — no split-deploy hazard
- `firebase.json` `Cache-Control: no-store` for `sw.js`/`registerSW.js` (CDN can't cache them)

## Out of Scope

- **Privacy / IRB review and consent workflow**: Profile collection captures student PII (full name, email, age, height, weight, gender, athlete type). Privacy / IRB review, FERPA posture for school deployments, and parental-consent flow for minors are deferred to a follow-up story owned by Concord's privacy / research-ops team. This conversion ships the profile-collection UI but **must not be released to students until that review clears**
- **Firestore-persistence code paths beyond the contexts described in this spec**: tracked-metric order persistence, per-day availability defaults — follow-up stories. (The offline write queue IS in scope — DataGOAT is a PWA where users may log on the sideline with no connection.)
- **CODAP plugin test harness**: a mock postMessage host for unit-testing `codapApi.ts`
- **PWA manifest icons / theme color update** to match the dark-theme branding — small follow-up PR
- **E2E / Playwright tests, visual regression, snapshot tests, static-layout tests, chart-placeholder tests**. UI tests for the chart-rendering follow-up land with that follow-up
- **Profile-screen "Linked Accounts" management UI** for after-the-fact provider management (sign-in-time linking only)
- **`signInWithRedirect` fallback** for OAuth on iOS Safari Private Browsing / in-app webviews. Triggered by real user complaints, not speculative work
- **`beforeSignedIn` blocking trigger** for re-validating Facebook users who initially shared email and later revoked it. Edge case; follow-up if surfaced

## Not Yet Implemented

Each item below MUST be filed as its own tracked Jira ticket before this story's parent epic is closed, even if the tickets remain unimplemented. The tickets are the lifecycle anchor — without them, "deferred" silently becomes "forgotten."

- **Real chart rendering** — SVG path generation, scales, axes, line/bar drawing, goal/average lines for `<MetricChart>` and the Metric Detail inner chart. *What ships now*: gray-box `<rect>` placeholder at final dimensions, full prop API (`type`, `data`, `goalLine`, `averageLine`, `title`, `description`), complete a11y contract (`role="img"`, `<title>`, `<desc>`), and a fully working visually-hidden `<ChartDataTable>` with "Show data" toggle. *Acceptance for the follow-up*: the placeholder gray-box and "Chart placeholder - TBD" text are gone from every consumer; visual chart renders for all metrics in the Dashboard chart cards and the Metric Detail screen; the prop API, dimensions, a11y wiring, data-flow plumbing, and consumer call sites are unchanged — the swap is purely path-generation math
- **Designer-final PerformanceLog metric set** — per-athlete-type performance metric sets (Endurance vs. Strength and Power). *What ships now*: a placeholder set (Wins, Losses, Goals, Assists, Yards, Tackles) with `inputType: 'numeric'` read from the `PERFORMANCE_METRICS` registry in `src/metrics/performanceMetrics.ts`. *Acceptance for the follow-up*: PerformanceLog displays the correct metric set per the user's `athleteType`; the registry is the only file that changes; no UI component edits required
- **Designer-final addable-metric set** — the AddMetric screen's catalog of additional metrics users can add beyond the default `WELLNESS_METRICS` / `PERFORMANCE_METRICS` lists. *What ships now*: a verbatim port of the prototype's own placeholder data (a 10-iteration loop generating `wellness-custom-1..10` / `performance-custom-1..10` with names `"Wellness Metric1..10"` and no info-modal copy), exposed via the `ADDABLE_WELLNESS` / `ADDABLE_PERFORMANCE` registries in `src/metrics/addableMetrics.ts`. *Acceptance for the follow-up*: the placeholder loop is replaced with a designer-final list (real `name`, `whoCollects`, `howCollected`, `description`, `unit`, `inputType` per entry); only `addableMetrics.ts` changes
- **User-configurable PerformanceTotals window** — a UI affordance for switching the totals between season-bounded, monthly, and all-time views. *What ships now*: totals computed over the visible HISTORY window (last 30 days), matching the date-nav range. *Acceptance for the follow-up*: a window-picker (or similar UX) lets the user choose; the computation is parameterized over the window. Likely waits until the designer-final metric set lands and real users surface the use case
- **Field-test contract for tappable calendar cells** — Health & Wellness dashboard calendar cells are interactive even though their hit area is below 44×44 px (~32 px on a 375 px viewport). Designer accepted the trade-off explicitly. Content team logs ≥ 5 sessions of real users tapping cells across multiple days, recording mis-tap rate. *Revisit triggers*: > 15% mis-tap rate, or any user feedback citing the size as a barrier. *Revisit options*: (a) increase tap area via invisible `::before` padding, (b) add long-press confirmation, or (c) drop the interactive cell and add an explicit "Jump to date" picker. This story does NOT block on the field test; it lands the interaction with the trade-off documented

## Decisions

### Theme — adopt the prototype's dark theme
**Context**: The prototype uses a dark theme; the existing app uses a light theme. The conversion needs a single visual direction.
**Options considered**:
- A) Adopt the prototype's dark theme; discard the current app's light styling entirely.
- B) Adapt the prototype's component structure to the existing light palette.

**Decision**: **A** — the design's color palette (`--bg: #080A0E`, `--accent: #00B3C0`, etc.) becomes the source of truth.

### Single-PR landing for the conversion
**Context**: ~7,000 LOC across ~18 steps in one PR is a high review cost.
**Options considered**:
- A) Single atomic PR with per-step commits.
- B) Phase the conversion across multiple PRs landing in `main` over time.

**Decision**: **A** — the bundle keeps the prototype-to-React port atomic so reviewers see the whole new shape at once and partial conversions can't end up in `main`. Per-step commits keep individual diffs reviewable.

### Single-file vs split implementation.md
**Context**: ~18 implementation steps could fit in one file or be split (`implementation-100.md`, `implementation-200.md`).
**Options considered**:
- A) Keep as a single `implementation.md`.
- B) Split into multiple files.

**Decision**: **A** — the file remains navigable.

### Chart library — placeholders this conversion, real charts as follow-up
**Context**: The dashboard's chart cards and Metric Detail screen need real charts, but designing the SVG path-generation math is its own design exercise.
**Options considered**:
- A) Hand-roll SVG path math + axes + line/bar drawing in this PR.
- B) Adopt Chart.js (or similar library).
- C) Ship `<MetricChart>` as a gray-box placeholder at final dimensions with the full final prop API and the chart-accessibility contract; defer real rendering to a follow-up.

**Decision**: **C** — placeholders ship now with `role="img"` / `<title>` / `<desc>` wiring and a fully working visually-hidden data table; the follow-up swap is purely the path-generation math because props, dimensions, a11y wiring, and data-flow plumbing are already in place. Custom SVG (not Chart.js) remains the long-term direction.

### PerformanceLog metric set — registry-driven placeholder
**Context**: The prototype's Performance Log placeholder set (Wins / Losses / Goals / Assists / Yards / Tackles) doesn't differentiate by athlete type. The designer's note on the prototype: *"Note: needs further work; do we differentiate game vs practice? What are the default sets for E vs SP?"*
**Options considered**:
- A) Port the placeholder verbatim; treat metric-set-by-athlete-type as follow-up.
- B) Block on designer input before porting Performance Log.
- C) Build the port against a `MetricDefinition`-shaped `PERFORMANCE_METRICS` registry; supply a single default set for now; designer-final sets land via registry edit.

**Decision**: **C** — registry-driven, single placeholder set for now. Designer is mid-iteration and will be for at least the next week (as of 2026-04-28); blocking the conversion is unjustified. All six placeholder metrics use `inputType: 'numeric'`.

### Lazy-loading discipline — only `/codap`
**Context**: The conversion adds many deps; lazy-loading reduces initial JS for users who never visit certain routes.
**Options considered**:
- A) Lazy-load `CodapPlugin`, the chart library, and `@dnd-kit` aggressively.
- B) Lazy-load only `/codap`.

**Decision**: **B** — `@dnd-kit` runs during onboarding (every new user) and on every reorder, so it's not a niche path. Chart components are placeholders (negligible bytes). `CodapPlugin` + `@concord-consortium/codap-plugin-api` are visited only by the small subset of users who export to CODAP. If the bundle budget is blown, revisit `@dnd-kit` first.

### Form validation — React Hook Form + Zod
**Context**: Profile and log-entry screens have many fields; controlled inputs would be performance-sensitive.
**Decision**: RHF + Zod. Uncontrolled inputs for performance; Zod schemas can be composed per-metric and later built dynamically if metric definitions move to Firestore. `@hookform/resolvers` glues RHF to Zod.

### Drag-reorder library — `@dnd-kit/core` + `@dnd-kit/sortable`
**Context**: Tracked Data Setup needs touch + keyboard + pointer drag.
**Options considered**:
- A) `@dnd-kit/core` + `@dnd-kit/sortable`.
- B) `react-dnd`.

**Decision**: **A** — mobile is the primary form factor. `@dnd-kit`'s `TouchSensor` + `KeyboardSensor` + `PointerSensor` compose cleanly; `react-dnd` has no first-class keyboard story and weaker touch handling.

### CODAP plugin glue — `@concord-consortium/codap-plugin-api`
**Context**: The plugin needs the postMessage handshake and data-context API.
**Options considered**:
- A) Hand-roll postMessage glue in `src/codap/codapApi.ts`.
- B) Use the existing Concord-maintained npm library.

**Decision**: **B** — drops ~50 lines of glue; the file becomes a thin DataGOAT-specific wrapper. The library tracks CODAP's protocol authoritatively as it evolves.

### Plugin mode detection — route-based, not iframe-based
**Context**: An earlier draft used `useIsCodap()` (`window !== window.parent`) to choose between plugin-mode and app-mode rendering.
**Options considered**:
- A) Iframe detection.
- B) Route-based gating via a dedicated `/codap` route.

**Decision**: **B** — `window !== window.parent` fires for any iframe (dev-tool previews, unrelated embeds), and the CODAP URL we hand to CODAP is already under our control. Route-based is explicit, has no false-positive surface, and avoids a post-message handshake. The iframe-detection hook IS used in `main.tsx` for one narrow purpose: a top-level visit to `/codap` is bounced to the wrapped URL via `window.location.replace`, with `?noredirect=1` as a dev escape.

### Calendar-tap navigation — URL-encoded date
**Context**: The prototype passes the tapped date through a window-global flag (`_calNavOverride`).
**Options considered**:
- A) URL search param `/wellness?date=2026-04-15`.
- B) Path param `/wellness/:date?`.
- C) Component/context state.

**Decision**: **A** — browser back/forward works naturally, refresh preserves the date, and links are shareable. Path-param was rejected as an unnecessary optional-segment route variant; pure component/context state was rejected because it loses back/forward + refresh + share for no implementation savings.

### Tappable calendar touch targets — accept sub-44px
**Context**: Health & Wellness dashboard calendar cells (~32 px wide on 375 px viewports) fall below the 44×44 px guidance.
**Decision**: Designer accepted the trade-off explicitly so the content team can field-test the navigation pattern. Compensating affordances ship: visible hover/focus indicator, `:focus-visible` outline using `var(--focus-ring)`, Enter activation, and a per-cell visually-hidden label so screen readers announce the day's state and that it's actionable. Field-test contract and revisit triggers are tracked in **Not Yet Implemented**.

### Calendar-cell semantics — plain anchor link, no `role="button"`
**Context**: An earlier port mirrored the prototype's div-with-Space-handler pattern.
**Options considered**:
- A) `<Link role="button">` with synthesized Space=click handler.
- B) Plain `<Link>` with native Enter activation only.

**Decision**: **B** — the cell is genuinely a navigation link (URL is shareable, browser back/forward works). `<Link role="button">` with synthetic Space is a documented anti-pattern: AT announces "button" while Cmd/middle-click still produce anchor behavior, and the synthetic `currentTarget.click()` bypasses the modifier-key checks anchors normally honor.

### Tappable calendar filter — both rules required
**Context**: An earlier draft used "non-inactive day" as shorthand.
**Decision**: Cell is tappable iff (a) `state !== 'inactive'` AND (b) the cell's calculated date offset is in `[0, HISTORY]`. Future-dated cells specifically must NOT be tappable — they have no log to navigate to and would dead-end the user.

### Inactive-cell a11y — render as `<div>`, keep visually-hidden label
**Context**: Inactive cells need to NOT receive Tab focus while remaining comprehensible to screen readers via virtual cursor.
**Decision**: Inactive cells render as `<div>` (no `role`, no `tabindex`, no click handler) but DO render the visually-hidden label (`{shortFmt(date)}: outside tracking window`). Tab navigation skips inactive cells; SR users still hear every day's state.

### Drag-reorder UX — no edit toggle / delete column
**Context**: The prototype HTML's `tracked-data-screen` includes an edit toggle that reveals a delete column and hides checkboxes.
**Decision**: The pinned design has no edit affordance — rows always show drag handle + Track checkbox + name + per-metric info button, and unchecking a row is the un-track action. Drag-reorder is always live. (Per "Update spec when deviating" rule, this is the new pinned decision.)

### KeyboardSensor activation key — Space OR Enter
**Context**: `@dnd-kit/core`'s `KeyboardSensor` defaults to Space-only; the requirements a11y contract says Space OR Enter.
**Decision**: Override `KeyboardSensor` `keyboardCodes` to bind both `Space` and `Enter` to start/end, and `Escape` to cancel — keyboard users who habitually press Enter on focusable controls don't hit a dead key.

### Availability input — nested yes/no tree
**Context**: The prototype's Availability input is a nested yes/no tree: "Did you have practice today? Y/N" → "Did you participate? Y/N", and the same pair for Game.
**Decision**: Port verbatim. Sub-values are `played` (participated) and `dnp` (did not play). May be updated by the designer before conversion — treat as provisional. AvailabilityTree is NOT wrapped in `<RadioGroup>` (which would invent fieldset semantics the prototype doesn't have).

### Log inputs — manual numeric entry only
**Context**: An earlier design considered sliders / steppers / +/− buttons.
**Decision**: Plain numeric text fields only, on Health & Wellness Log and Performance Log alike. Designer reviewed enhanced controls and rejected them.

### Metric definitions — hardcoded but registry-shaped
**Decision**: Hardcoded initially, but structured so the same shape could come from Firestore per-user config later. Define a `MetricDefinition` type and keep all definitions in central registries (`src/metrics/wellnessMetrics.ts`, `performanceMetrics.ts`, `addableMetrics.ts`) rather than spreading them across components. Each definition includes the `whoCollects` and `howCollected` info-modal copy; **port the latest prototype's text verbatim** — do not paraphrase.

### Profile-screen Welcome copy — two ProfileForm modes
**Context**: New users need welcome copy + "Set Up Your Tracked Data" CTA; returning editors don't.
**Options considered**:
- A) Two ProfileForm modes (`onboarding` vs `edit`) derived from `useUser().loadState.status`.
- B) Two separate components.

**Decision**: **A** — mode is derived from `'missing'` (onboarding) vs `'loaded'` (edit). No `mode` prop, no prop drilling. Form fields are identical in both modes.

### ProfileForm — drop email/password fields
**Context**: The prototype's `#profile-screen` includes editable email and password fields.
**Decision**: Drop both. The user is already authenticated by the time they hit `/profile` (signup or OAuth captured email + password). Re-collecting password is dead UI; re-collecting email without `updateEmail()` re-auth is misleading. Email renders above the form as read-only "Signed in as ..." muted text. A future change-email flow gets its own surface.

### ProfileForm — relax age/height/weight bounds
**Context**: The prototype renders age/ft/in/weight as `<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="...">` with implicit ranges.
**Decision**: React app uses `<input type="number" min="0">` with no upper bound. Real-world athletes (4-year-old gymnast, 250+ lb football lineman) can fall outside the prototype's 5-100 / 3-8 / 0-11 / 50-500 ranges; the form must not gate on them.

### Email verification — non-blocking
**Decision**: Users enter the app immediately after registration; no gate. `sendEmailVerification` runs after `createUserWithEmailAndPassword`. After signup, the user sees the EmailVerification screen briefly. Once in the app, `VerificationBanner` shows a dismissible reminder if `!isEmailVerifiedOrTrusted && daysUnverified >= 7`.

### Trusted-provider OAuth treated as verified-equivalent
**Context**: Google and Facebook require email-ownership verification before issuing an OAuth token that includes the email; asking the user to ALSO click a Firebase-sent link to the same address is friction with no security gain.
**Decision**: The rule is "user has `emailVerified=true` OR signed in via a trusted OAuth provider that returned an email" — encoded in `isEmailVerifiedOrTrustedProvider` and the single source of truth for routing, the verification banner, and the CODAP plugin gate. `sendEmailVerification` is not called for trusted-provider sign-ins; the banner never shows for them. Adding more providers is a one-line change to `TRUSTED_OAUTH_PROVIDERS`.

### Forgot-password copy — neutral on account existence
**Context**: Firebase Auth's `sendPasswordResetEmail` is server-side neutral on existence; UI copy must match or it leaks.
**Decision**: Pin success copy to `"If an account exists for that email, we sent a reset link. Check your inbox..."`. Do not echo the email back. Do not differentiate visible state by `auth/user-not-found` or `auth/too-many-requests` (Firebase rate-limits per account, so surfacing it would create an existence oracle). Only `auth/network-request-failed` surfaces inline. Errors logged via `logError` (not user-visible).

### Facebook missing-email — server-side blocking trigger (was client-side fallback)
**Context**: Facebook lets users deny the `email` scope; `user.email` is then `null`. An earlier design routed missing-email Facebook users to a fallback EmailVerification screen with a manual email field.
**Options considered**:
- A) Client-side fallback: detect `user.email == null`, route to fallback screen, call `updateEmail` + `sendEmailVerification`.
- B) Server-side rejection via `beforeUserCreated` Cloud Function blocking trigger.

**Decision**: **B** — the client-side fallback is bypassable by a malicious client and creates orphan `null`-email user records when interrupted. The blocking trigger throws `HttpsError('invalid-argument', '[BLOCKED_NO_EMAIL] ...')` when the provider data includes `facebook.com` and `event.data.email` is missing. Prerequisite: Firebase project upgraded to Identity Platform (free tier through 50K MAU). Lives under `functions/src/auth/blockFacebookMissingEmail.ts`; unit-tested + emulator-tested.

### Sentinel-prefixed blocking-function error message
**Context**: The Firebase Auth client SDK surfaces blocking-function rejections as `auth/internal-error` with the trigger's message string concatenated into `error.message` — no structured error code.
**Options considered**:
- A) Substring-match the user-facing copy at the client.
- B) Prepend a stable sentinel `[BLOCKED_NO_EMAIL]`; client matches on the sentinel only and strips it before rendering the remainder.

**Decision**: **B** — robust to (a) future SDK changes to how blocking errors are wrapped (the v8→v9 migration changed the wrapping shape once), and (b) editing the user-facing copy without remembering to update the client. The Cloud Function is the single source of truth for the copy — no `blocked-no-email` entry in `authErrorMessages`.

### Kill switch on the blocking function
**Decision**: `FACEBOOK_BLOCKER_ENABLED` runtime parameter (`defineString` from `firebase-functions/params`, default `'true'`) makes the trigger a no-op when set to anything else. Existing instances pick up the change on next cold-start. Cheap insurance for a function on the auth critical path.

### Account-linking flow — inline at sign-in, sign-in-time only
**Context**: An earlier draft punted `auth/account-exists-with-different-credential` to a deferred Profile-screen "Linked Accounts" UI that doesn't exist.
**Decision**: Implement inline linking now. LoginForm/SignupForm catches the error, extracts the pending Facebook credential via `FacebookAuthProvider.credentialFromError(error)`, and flips to component-local `mode='linking'`. The panel shows BOTH a Google button AND an email/password form (email locked); the user picks the method they used originally — no `fetchSignInMethodsForEmail` lookup, since exposing existing methods to an unauthenticated client leaks account existence + provider (Google has deprecated the API for this reason). On success, `linkWithCredential(result.user, pendingCredential)` (the user from the just-resolved sign-in promise — NOT `auth.currentUser`, which is subject to cross-tab races). Pending credential lives in component-local state; refreshing restarts the flow. Profile-screen "Linked Accounts" is **out of scope**.

### `linkWithCredential` user — `result.user`, not `auth.currentUser`
**Context**: An earlier draft called `linkWithCredential(currentUser, pendingCredential)`.
**Decision**: Use `result.user` from the just-resolved sign-in promise. Avoids cross-tab races and matches the canonical Firebase pattern.

### `signInWithRedirect` — not used
**Decision**: Both LoginForm and SignupForm use `signInWithPopup` exclusively. `signInWithRedirect` is intentionally NOT used because its redirect handler relies on third-party storage that's now partitioned away in cross-site iframes (Chrome Storage Partitioning, Firefox dFPI, Safari ITP). Known limitation: popup-only OAuth can fail on iOS Safari Private Browsing and in-app webviews; users see `auth/popup-blocked` with self-diagnosing copy and fall back to email/password. A redirect-fallback is a follow-up triggered by real user complaints.

### `EmailVerification` send-failed signal — `useLocation().state`, not query param
**Context**: SignupForm's `sendEmailVerification` can reject; the EmailVerification screen needs to know.
**Options considered**:
- A) Pass via `?send-failed=1` query param.
- B) Pass via `useLocation().state.sendFailed`.

**Decision**: **B** — the signal is transient and refreshing the screen should not assert that a send failed when nothing tried to send.

### `OAuth popup-blocked` copy — self-diagnosing
**Context**: Generic "try again" copy is worse than concrete recovery on mobile, where popup-blocking is the dominant failure mode.
**Decision**: Pin copy: `"Sign-in popup was blocked. If you're using Private Browsing or an in-app browser (like the one inside Instagram or Facebook), open this site in a standard browser (Safari or Chrome) and try again. Otherwise you can sign in with email and password below."`

### OAuth popup rejections route through `logError`
**Context**: `sendEmailVerification` and `sendPasswordResetEmail` failures already route through `logError`; OAuth popup rejections need the same treatment.
**Decision**: `auth/popup-blocked`, `auth/popup-closed-by-user`, `auth/cancelled-popup-request`, `auth/network-request-failed` all log via `logError`. `auth/popup-closed-by-user` logs at debug level (or filtered upstream when telemetry lands) since it's a normal user action.

### `sendEmailVerification` failures — log + surface, don't swallow
**Decision**: Wrap in try/catch. Log via `logError`. Pass the failure state into the EmailVerification screen so the user sees a clear "couldn't send" note. Resend button is always visible, not gated on failure state.

### `registeredDisplayName` bridge — drop
**Context**: The existing `Login.tsx` collects `displayName` during email registration; the bridge in `App.tsx` worked around an `onAuthStateChanged`-vs-`updateProfile` race.
**Decision**: Drop the bridge entirely. The prototype's signup collects email + password only; full name moves to ProfileForm. ProfileForm submit writes displayName to BOTH Firebase Auth (`updateProfile(auth.currentUser, { displayName })`, best-effort + logged on rejection) and Firestore (`useUser().updateProfile(...)`, canonical). Consumers prefer `useUser().profile.fullName`; `user.displayName` is the cached fallback.

### Profile load state — four-state union
**Context**: Without a tri-state, `ProtectedRoute` would redirect returning users to `/profile` on every cold start while the Firestore fetch was in flight.
**Options considered**:
- A) Tri-state: `loading | missing | loaded`. Map all errors (snapshot-subscription failures, migration throws) to `'missing'`.
- B) Four-state: `loading | missing | loaded | error{kind}`. Errors get their own state with a discriminator.

**Decision**: **B** — collapsing errors to `'missing'` would let the onboarding submit `setDoc(merge:true)` over a real or unmigrated profile. The retry UI uses the `kind` discriminator (`'subscription'` → "check your connection"; `'migration'` → "contact support"). Onboarding routes (`OnboardingRoute`) gate identically except `'missing'` renders the form instead of redirecting.

### Migration error contract on `readDoc` — log + return null
**Decision**: `readDoc` wraps `migrateDocument` in try/catch. On throw, calls `logError(err, { docPath, fromVersion })` and returns `null`. UserContext maps `null` to `'error{kind: 'migration'}'` for the singleton profile (NOT `'missing'`); DataContext skips the doc and continues with the rest of the collection. Loud in logs, soft in UI — a single bad doc can't take down a session.

### Per-tab Firestore offline persistence
**Decision**: `firebase.ts` initializes Firestore with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`. Without persistent cache, offline writes queue only in memory and are lost on tab close, which is the wrong tradeoff for a PWA where users log data sideline-without-signal. `onSnapshot` cache-snapshots with `metadata.hasPendingWrites === true` are skipped so reconciliation never drops pending entries against our own un-acked writes.

### DataContext optimistic state — pending-map accumulator at the context level
**Context**: An earlier draft's per-instance debounce in WellnessLog/PerformanceLog would silently lose writes when the user typed across multiple fields within 500ms.
**Decision**: Lift the accumulator to DataContext. Each keystroke synchronously merges into a `pendingMap` (one map per collection, keyed by date) — a `useState`, not a ref, so every consumer re-renders. Schedules a debounced (500ms) Firestore write per date (independent timers per date so typing on date A then date B doesn't collapse into a mixed write). Pending state is reconciled against `onSnapshot` snapshots via field-level deep equality (`availability`, `performance.metrics`); reference-identity wouldn't reconcile since `onSnapshot` deserializes fresh references each emission. Pending entries store the queued uid so a late-firing flush after sign-out is rejected by Firestore rules. The 500ms debounce stays as a Firestore write-amp optimization but is no longer on the UI's critical path — typing updates the chip, totals, calendar, charts, and CTA copy synchronously per keystroke.

### Performance-merge deep-merge of `metrics`
**Context**: A symmetric `{...base, ...partial}` (used for wellness) would clobber `base.metrics` with the sparse `partial.metrics`.
**Decision**: Performance optimistic memo writes `metrics: { ...(base.metrics ?? {}), ...(partial.metrics ?? {}) }`. Verbatim port of the deleted `mergePartials` invariant.

### `MetricInputRow` — local string state
**Context**: Round-tripping the input value through `Number(raw) → String(numeric)` strips trailing decimals (`"1."`), leading zeros (`"07"`), and bare `"0"`.
**Decision**: `NumericInput` holds raw keystrokes in local state. The local-vs-parent reconciliation effect accepts external prop changes only when they don't round-trip to the user's current local string (handles cross-tab edits and form resets).

### Empty-entry factories — single source of truth
**Decision**: `emptyWellnessEntry(date)` and `emptyPerformanceEntry(date)` live in `src/types/data.ts`, version-stamped with `CURRENT_*_VERSION`. Both DataContext (for optimistic-merge bases) and the log components consume the same factory. The synthesized empty entry never reaches Firestore (only the partial is written); pinning the current version at the factory removes a footgun for any future consumer that branches on `entry.version`.

### Migration framework — migrate on read, persist on write
**Decision**: Documents are read from Firestore at their stored version and migrated in-memory before use. The original document is NOT rewritten during the read — it stays at its old version until a write triggers persistence at the current version. No background migration jobs needed; old documents are upgraded lazily as users interact. Migration functions are pure (no side effects, no async, no Firestore calls). Migration chain is sequential (v1→v2→v3, never v1→v3 directly). Missing `version` field is treated as `1`.

### `firestore.rules` — single owner-only wildcard, drop `/config/**`
**Context**: The existing rules file has the right user-data rule plus a `/config/**` block leftover from an earlier prototype.
**Decision**: Keep the wildcard `/users/{userId}/{document=**}` (every future user-scoped subcollection inherits owner-only access automatically). Drop `/config/**` — nothing in this conversion reads or writes config docs. If access patterns ever diverge per-collection (e.g., a shared-with-coach feature), that's the trigger to switch to explicit per-path rules.

### `npm run deploy` — ship hosting + functions + rules in lockstep
**Decision**: Tighten `deploy` from `firebase deploy --only hosting` to `firebase deploy --only hosting,functions,firestore:rules`. Self-enforcing — every deploy ships the client, the blocking Cloud Function, and any future rules edits together. Standalone `deploy:functions` stays as a kill-switch-flipping convenience.

### `logError` telemetry — Firebase Analytics as day-one destination
**Context**: `logError` is invisible in production with no telemetry seam wired.
**Options considered**:
- A) Sentry / Rollbar (new account, new SDK).
- B) Firebase Analytics (ships free with the existing `firebase` SDK; no new dep, no new account).

**Decision**: **B** — `logError` always `console.error`s; in production, additionally calls `logEvent(analytics, 'app_error', { message, context })` wrapped in try/catch and gated on `isSupported()`. The `analytics` instance is a lazy-initialized seam in `firebase.ts` (resolves to `Analytics | null`, null when unsupported / unconfigured) so dev / emulator / SSR / ad-blocker paths no-op cleanly. `VITE_FIREBASE_MEASUREMENT_ID` is the env-var hook. Real telemetry tools (Sentry/Rollbar) remain a one-file swap when chosen later.

### Mobile container — narrow column to 440px, drop visible surround
**Context**: DGT-6 shipped a 640px-capped layout with a visible "floating card" surround.
**Decision**: Narrow the column max-width to 440px (the prototype's `data-w="440"` width). Drop the visible surround — body and column share `var(--bg)`; no border, no shadow, no white column. Keep structural rules (two-tier height, landscape collapse, `box-sizing` reset, `tabIndex={0}` keyboard-scroll on `<main>`). Swap `<main>`'s `:focus-visible` outline from `#0693e3` to `var(--focus-ring)` — with no visible column edges, this outline becomes the only cue that the scroll container has focus.

### Version display — move to About screen
**Context**: The DGT-6 footer competes with dashboard CTAs for vertical space; the prototype has no equivalent.
**Options considered**:
- A) Keep the footer; bump constants for the conversion.
- B) Build-flag the footer (visible in dev/internal, hidden in prod).
- C) Drop entirely.
- D) Drop the always-visible footer; render version + build timestamp on the About screen.

**Decision**: **D** — `APP_VERSION` / `APP_VERSION_DESC` constants stay in code (bumped for this commit) and are consumed by the About screen instead of every route. Build timestamp injected via Vite `define`.

### Iconography — `vite-plugin-svgr` for glyphs, URL imports for brand marks
**Context**: The prototype contains 113 inline `<svg>` icons; ~30 are unique. Plus 3 brand SVG files (`datagoat-logo-login`, `google-logo`, `facebook-logo`).
**Decision**: Glyph icons live in `src/icons/` and import as React components via `?react`. Brand marks live in `public/icons/` and import as URL strings rendered through `<img>`. SVGR config injects `aria-hidden="true"` on every generated `<svg>`. Auth-screen DataGOAT logo preloaded via `<link rel="preload" as="image">`. Don't add new icons to the brand-mark category. Don't reach for an icon library or sprite sheet.

### Icon extraction — Node script with dotall regex (NOT bash `grep`)
**Context**: Bash `grep -oE` operates line-by-line and silently skips multi-line SVGs.
**Decision**: Ship `tools/extract-icons.mjs` (Node) using `/<svg[^>]*>[\s\S]*?<\/svg>/g`. Deduplicates unique glyphs by SHA-1 of inner content; strips wrapper width/height (svgr forwards props at consumer site). Output is `src/icons/icon-{hash}.svg` files; the implementor renames to canonical kebab-case role names. Explicit "don't use `grep -oE`" warning preserves the trap.

### Font loading — self-hosted WOFF2, four faces, Latin subset
**Context**: Two preload tags on first paint or four?
**Decision**: Self-hosted in `public/fonts/` so the existing PWA precache picks them up. Latin subset only (drops ~60% per face). Four faces: Barlow 400 + 700, Barlow Condensed 600 + 800. Preload only the two above-the-fold faces (`barlow-regular.woff2` for body + buttons, `barlow-condensed-extrabold.woff2` for the wordmark) — saves ~60 KB on the critical render path. The other two load via `@font-face` with `font-display: swap`. PWA offline behavior is unaffected: SW `globPatterns` precaches all four regardless of preload tags.

### Motion tokens — five durations, five easings
**Decision**: Component CSS Modules reference tokens (`var(--dur-quick)`, `var(--ease-default)`), not raw values. Hover/focus uses `--dur-quick` (150ms) by default. Tap-feedback uses `--dur-tap` (100ms). Carousel curves (`--ease-bounce`, `--ease-accel`) are signature — reuse only for the dashboard header carousel.

### Reduced motion — token-policy split
**Decision**: Essential tokens (`--dur-tap`, `--dur-quick`) remain active under `prefers-reduced-motion`. Decorative tokens + named keyframes (`accent-shimmer`, the dashboard header carousel) are zeroed via `@media (prefers-reduced-motion: reduce)`. JS timers (`DashboardHeaderSlide`, `MotivationMessage`) check `window.matchMedia(...).matches` at schedule time. Goat-tap-to-advance is the manual-advance affordance under reduced motion. Carousel pauses while the hamburger menu is open via `NavMenuContext`.

### `--accent-dark` — token, not inline hex
**Context**: The chip's "Some" diagonal stripe uses `#007A84` (a darker shade of `--accent`).
**Decision**: Introduce `--accent-dark: #007A84` in the Foundations step's token extraction. The `.chipSome` snippet uses `var(--accent-dark)` in all four positions. Future hover/active states needing a darker accent reuse the same token.

### Charts a11y — `role="img"` + `<title>` + `<desc>` + visually-hidden table
**Decision**: Every chart `<svg>` has `role="img"` + `aria-labelledby` to a `<title>` + `aria-describedby` to a `<desc>` (when provided). Metric Detail charts render an adjacent visually-hidden `<table>` of date/value pairs with a visible "Show data" toggle that swaps the class off. Activity calendars add a visually-hidden label per cell. Color-only encoding is always backed up by text or shape.

### Chip a11y — color + shape encoding
**Context**: Three teal-family colors (`var(--accent)` = All, `#007A84` = Some, transparent = None) could be confused by deuteranopic / protanopic users.
**Decision**: Supplement color with shape: All = solid filled square, Some = filled square with diagonal stripe overlay (linear-gradient), None = empty square with border. Costs ~5 lines of CSS, adds no markup. (If the designer pushes back on the visual, fall back to keeping the chip color-only and increasing legend prominence.)

### Chart placeholder text contrast — `var(--subtext)`, not `var(--muted)`
**Decision**: Bump the placeholder's "Chart placeholder - TBD" text from `var(--muted)` to `var(--subtext)`. `var(--subtext)` on `var(--surface2)` computes to ~7.0:1, comfortably above WCAG AA 4.5:1; `var(--muted)` is ~3.97:1, below AA.

### Skip-to-main link — `<header>`/`<main>` sibling structure
**Context**: An earlier AppShell layout placed `<AppHeader>` (with the hamburger trigger) inside `<main>`, so the skip link didn't actually skip the header chrome.
**Decision**: AppShell renders `skip-link → <header><AppHeader/></header> → <main id="main-content" tabIndex={0}><Outlet/></main> → <HamburgerMenu/>` (HamburgerMenu inside `<main>` so its backdrop scopes there). The structural sibling layout is what makes the skip link actually skip. Skip-link target additionally excludes section-heading chrome buttons via a `data-skip-link-exclude` attribute (CSS Module class names get hashed at build, so the data attribute is the cross-module discriminator). AuthLayout's form-area slot has `id="main-content"` + `tabIndex={-1}` so the anchor jump lands focus programmatically — without `tabIndex={-1}`, non-focusable elements receive the anchor jump but don't hold focus, breaking the skip-to-main UX. Skip-link rule (`.skipLink`) lives in `common.module.css` so AppShell and AuthLayout share it.

### Document `focusin` auto-scroll-into-view
**Decision**: AppShell registers a document-level `focusin` listener that scrolls the focused element into view BELOW any sticky chrome (sums sticky-positioned ancestor heights and follows up `scrollIntoView` with a corrective `scrollBy`). Without this, keyboard tabbing through wellness-log table rows / profile-form rows hides the focused row under sticky `.section-heading` + `.date-nav`.

### Shared `<Dialog>` primitive — one contract, two variants
**Context**: HamburgerMenu and MobileCodapModal both need WCAG 2.1.2 / 2.4.3 modal-dialog semantics.
**Decision**: Land `src/components/common/Dialog.tsx` in the routing-scaffold step (HamburgerMenu's first consumer; MobileCodapModal the second). Two variants: `centered` (default, fade-in + slight rise) and `topSheet` (full-width minus 12px side margins, slides down from above via `topSheetSlideDown` keyframe ported from the prototype's `menuSlideDown`). Dialog enforces `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus moves to first focusable on open, focus trap, Escape closes, backdrop click closes, focus return to trigger on close. Reduced-motion-wrapped enter/exit. Backdrop is `position: absolute` (NOT fixed) so it scopes to its parent's nearest positioned ancestor — no document body-scroll-lock.

### Dialog variant naming — `topSheet`, not `drawer`
**Context**: An earlier RESOLVED entry called the variant `drawer`.
**Decision**: Rename to `topSheet` ("top sheet" per Material). A drawer slides in from a side edge; the prototype's actual visual is a top-anchored panel that drops down inside its container. `topSheet` accurately distinguishes from bottom-sheet, side-sheet, and centered modal.

### `prefers-reduced-motion` opt-out — both CSS and JS
**Decision**: Two layers. CSS: every `@keyframes` rule and long-running decorative `transition` is wrapped in `@media (prefers-reduced-motion: reduce)` blocks that set `animation: none` / `transition: none`. JS: the dashboard header carousel and motivation rotation check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` at schedule time and short-circuit when matched; existing timers are cleared when the match state changes via the matchMedia `change` event. Essential motion (`:focus-visible` outlines, click/tap feedback transforms, hover color transitions) is retained.

### DashboardHeaderSlide reactive deps — three inputs encoded
**Decision**: The carousel timer encodes all three reactive inputs in a single effect: `prefers-reduced-motion` at mount, OS-toggling at runtime (`mq.addEventListener('change', ...)`), and `useNavMenu().isOpen` (pause while menu open). `start()` / `stop()` helpers clear and restart cleanly; `[isOpen]` is the deps array.

### Carousel pause coordination — `NavMenuContext`
**Decision**: Pause the dashboard header-slide carousel while the hamburger nav overlay is open so two simultaneous animations don't compete for CPU/attention. Implementation: `NavMenuContext` exposes `{ isOpen, setIsOpen }`. Provider mounts in AppShell. HamburgerMenu calls `setIsOpen` on open/close. DashboardHeaderSlide consumes the context.

### Calendar-tap navigation — preserve tapped date via search param
**Context**: The prototype's JS preserves the offset on calendar-tap arrival via a window-global flag (`_calNavOverride`).
**Decision**: Direct navigation to `/wellness` (hamburger / dashboard CTA / back from MetricDetail) defaults the date to today. Navigation via calendar-cell tap preserves the tapped date through the `?date=YYYY-MM-DD` search param. WellnessLog and DateNav read the date via `useSearchParams()`; prev/next mutates the search param.

### `ActivityCalendar` derivation memoization
**Decision**: Wrap the per-cell completeness derivation in `useMemo` keyed by `[entries, trackedMetricIds, todayIso]`; wrap the component itself in `React.memo`. DataContext re-emits on every committed snapshot AND every optimistic-pending change (per-keystroke under the lifted-debounce design); the memo prevents re-deriving 28 cells per emit when inputs haven't changed.

### `MetricDetail` for unknown `:metricId` — redirect to parent log
**Decision**: If lookup against `WELLNESS_METRICS` / `PERFORMANCE_METRICS` returns `undefined`, render `<Navigate to={type === 'wellness' ? '/wellness' : '/performance'} replace />`. No dedicated 404 view — reachable only via hand-typed URLs, stale bookmarks, or removed-metric registry changes; bouncing back to the parent log is the right recovery for all three.

### `VerificationBanner` placement — first child of `<main>`, not sticky
**Decision**: Mounts as the first child of `<main>` in AppShell, ahead of the route `<Outlet />`. Sits below the header chrome on every authed route. Renders in normal document flow, NOT sticky — scrolls away with content. Per-route chrome (carousel / SectionHeading / AppHeader) takes over once the user scrolls past. Dismissible per-account via the X button. No per-route opt-out.

### `VerificationBanner` threshold refresh — hourly + visibilitychange
**Context**: Without a refresh tick, the User reference is reused across token refreshes and AuthContext never re-renders consumers, so `Date.now()` is read once at mount and the threshold is never re-checked.
**Decision**: VerificationBanner forces a re-render on an hourly `setInterval` and on `document.visibilitychange`. `daysUnverified` is computed locally inside VerificationBanner from `user.metadata.creationTime` (NOT on AuthContext). Subscribe only while `user && !isEmailVerified`.

### `daysUnverified` locality — banner-internal, advisory only
**Decision**: Both inputs to `daysUnverified` (`user.metadata.creationTime` and `Date.now()`) are client-trusted, so the banner is **advisory only** — a soft nudge, not a compliance gate. Real verification enforcement keys off `isEmailVerifiedOrTrustedProvider(user)` (e.g., the CODAP plugin sign-out path).

### `DateNav` legend — bound to `withChip`
**Decision**: Single prop, single concern. The legend exists only to explain the chip's color+shape encoding, so the two ship together; there is no `withLegend` prop.

### `DateNav` boundaries — `disabled` at offset 0 / HISTORY
**Decision**: Prev disables at `dateAtOffset(0)` (oldest tracked date, 29 days ago); next disables at today (`dateAtOffset(HISTORY)`).

### `MotivationMessage` initial index — `-1`
**Context**: A naive `useState(0)` would advance to index 1 on the first show.
**Decision**: Initial index is `-1` so the first inactive→active transition advances to index 0 (the streak greeting), matching the prototype's `showNextMotivation()` running once on script load. Module-scope index cursor keeps rotation surviving `/dashboard` remounts within a page-load.

### Asymmetric per-slide hold timings
**Decision**: Wordmark holds 6750ms before advancing; motivation holds 9000ms — port verbatim from the prototype's `_dashHoldTimes = [6750, 9000]` array. Schedule with `setTimeout` reading the current slide's hold value (NOT `setInterval`, since the period alternates). Export `WORDMARK_HOLD_MS` and `MOTIVATION_HOLD_MS` constants.

### Three-state slide machine — `default | active | exitLeft`
**Context**: Without resetting just-exited slides back to default, alternation direction flips on every other cycle.
**Decision**: Each slide has three positions: default (off-screen RIGHT, `translateX(100%)`), `.active` (center), `.exitLeft` (off-screen left, `translateX(-100%)`). Track the exiting-slide index in a separate `useState<SlideIndex | null>` and clear it via a `setTimeout` of `EXIT_RESET_MS = 650` so the just-exited slide's NEXT entry comes from the right.

### Goat-tap-to-advance — always available
**Decision**: Clicking the dashboard logo calls the same `advance()` handler the timer fires. Under reduced motion, this is the only way to advance; under normal motion, it lets users skip ahead. The on-click handler resets the next-slide `setTimeout` so the user gets a full hold of the new slide.

### `MotivationMessage` name fallback chain
**Decision**: `nickname || fullName.split(' ')[0] || '(name)'`. The first-name `.split(' ')[0]` and the literal `'(name)'` placeholder are both load-bearing — drop them and a half-completed profile (full name set, nickname empty) shows the user's full name in motivation messages instead of just the first name; an empty profile shows nothing or `undefined` instead of the explicit `(name)` placeholder student demos hit on Day 1.

### `colorScale` input — keyboard arrows-and-select-in-one-step
**Decision**: Arrow keys move focus AND select the new swatch in one step (`selectSwatch(next)`, not just-focus). Tab moves between metric rows; Arrow Left / Right within a row moves between swatches AND fires the change. Pressing a number key (1-N) jumps directly to that swatch. Each swatch is a focusable `<button>` with `aria-label="Hydration: 4 of 8"`-style description; the selected swatch gets `aria-pressed="true"`.

### `AvailabilityTree` — inline labels, not nested fieldsets
**Decision**: NOT wrapped in `<RadioGroup>`. Each Y/N pair uses inline `<label>` + `<input type=radio>` pairs grouped by `name=`. Wrapping each Y/N pair in a separate fieldset would invent semantics the prototype doesn't have. Open/closed state of the participation sub-row is **CSS-only** via `.avail-option.open` — no React conditional render.

### Native `<select>` for SelectField (NOT custom dropdown)
**Context**: The prototype implements a custom dropdown component (`.custom-select-trigger`, `.custom-select-option`) with arrow-key navigation and a `.drop-up` direction-flip when `spaceBelow < 200px`.
**Decision**: SelectField uses the native HTML `<select>` element (styled via `.field-select`) to inherit the platform's keyboard, screen-reader, and touch-keyboard behaviors for free. The `.custom-select*` class family and the drop-up logic are intentionally NOT ported. If a screen later needs the custom dropdown UX (e.g., custom-rendered options with icons), that's a follow-up.

### `.has-value` declarative class toggle
**Context**: The prototype attaches a global `input` listener that toggles a `.has-value` class on every input.
**Decision**: TextField/PasswordField/SelectField read the current value via RHF's `watch()` (or local state when uncontrolled) and apply the class declaratively as `className={\`${fields.fieldInput}${value ? ` ${fields.hasValue}` : ''}\`}`. No global event listener. Without this, all inputs render in the muted "empty" border state forever.

### Form-field a11y wiring contract
**Decision**: Single contract inherited by TextField, SelectField, RadioGroup, PasswordField. Input gets `id={name}` (matched by `<label htmlFor={name}>`), `aria-invalid={!!error}`, and `aria-describedby={[error && \`${name}-error\`, hint && \`${name}-hint\`].filter(Boolean).join(' ') || undefined}`. The error `<p>` gets `id={\`${name}-error\`}` + `role="alert"` so RHF-rendered errors after submit are announced. The hint `<p>` gets `id={\`${name}-hint\`}`. PasswordField additionally gives `.eye-btn` `aria-label="Show password"` / `"Hide password"` and `aria-pressed={shown}`. RadioGroup wires `aria-describedby` on the `<fieldset>`.

### `VerificationBanner` a11y — `role="status"`, not `role="alert"`
**Decision**: Container uses `role="status"` (implies `aria-live="polite"`) so SR users hear the banner when it appears asynchronously after `daysUnverified` crosses the 7-day threshold — politely, without interrupting current speech. Dismiss button gets `aria-label="Dismiss verification reminder"`.

### `DateNav` and calendar-scroll button labels — distinct wording
**Decision**: DateNav prev/next get `aria-label="Previous date"` / `"Next date"`. ActivityCalendar window-scroll buttons get `aria-label="Show earlier weeks"` / `"Show later weeks"`. Distinct wording reflects distinct semantics — DateNav moves the active date; the calendar scrolls the visible window.

### CODAP data-context naming — hyphen-cased identifiers
**Context**: CODAP's resource paths use bracket notation (`dataContext[<name>].item`); names containing `&` or spaces break the parser and items land in a phantom context that no table renders.
**Decision**: Names must be hyphen-cased identifiers — matching sibling Concord plugins (e.g., NOAA's `US-Weather-Stations`). The plugin sends two contexts: `DataGOAT-Wellness` (with a `Wellness` collection) and `DataGOAT-Performance` (with a `Performance` collection). The case-table is attached to the data context, not the collection.

### CODAP plugin auth — own `signInWithPopup` flow
**Context**: Modern browsers (Chrome SP, Firefox dFPI, Safari ITP) key client-side storage by `(top-level site, embedded site)`, not by embedded origin alone. The iframe's IndexedDB is partitioned away from the top-level DataGOAT tab.
**Decision**: The plugin runs its own sign-in flow via `<CodapPluginSignIn>` (mirrors `LoginForm`'s three methods: Google + Facebook OAuth via `signInWithPopup`, plus email/password). The popup is a top-level window not subject to the partition. After sign-in, if `isEmailVerifiedOrTrustedProvider(user) === false`, the plugin signs the user back out and shows a "verify your email at datagoat.concord.org" notice.

### CODAP plugin — open auth-flow links in new top-level tabs
**Decision**: "Sign up" and "Forgot password" links from `<CodapPluginSignIn>` open `${origin}/signup` and `/forgot-password` in a new top-level tab via `target="_blank"` — onboarding and password-reset live in the main app router and are not duplicated in the plugin.

### CodapButton — direct URL construction, not `/codap` redirect
**Decision**: The "Analyze Your Data in CODAP" button opens the wrapped URL directly via `buildCodapWrappedUrl()` rather than opening `/codap` and relying on the redirect. Saves ~200-500ms of bundle parse + redirect time on every click. The shared helper means one source of truth for the URL shape.

### CodapButton — desktop opens, mobile shows modal
**Decision**: Desktop/tablet (≥ 640px) opens `https://codap3.concord.org?di=<origin>/codap` in a new tab. Mobile (< 640px) opens a modal directing the user to `datagoat.concord.org` on their desktop, since CODAP doesn't work well on small screens.

### CODAP iframe redirect — `parent` not `top`
**Decision**: Detection uses `window.self !== window.parent` rather than `window.top` to avoid rare cross-origin SecurityErrors on `top` access.

### `CodapDatasetSelector` — fold into `CodapPlugin.tsx`
**Context**: Considered as a separate file.
**Decision**: Fold into `CodapPlugin.tsx`. The plugin view is small (one fieldset + one CTA); a separate file adds a boundary without a corresponding reuse seam. Date-range picker is also deferred — for now `sendDataset` writes the entire HISTORY window.

### `PerformanceTotals` window — visible HISTORY (30-day)
**Decision**: Totals are computed over `historyOffsetFromISO(entry.date) ∈ [0, HISTORY]`, matching the date-nav range so the totals column is consistent with the rest of the screen. Sum-over-window covers the placeholder set's all-`numeric` metrics. Extensibility marker remains for non-additive metrics in the designer-final set. User-configurable totals window is filed as **Not Yet Implemented**.

### Tests scope — migrations + state-machine component tests
**Context**: Shipping ~7,000 LOC with zero automated tests is risky; full UI coverage would generate throw-away tests since the UI may churn after first-user feedback.
**Options considered**:
- A) No tests this commit; UI tests in a follow-up.
- B) Migration-chain unit tests only.
- C) Migration tests + a targeted set of RTL component tests on state-machine logic that survives design churn (props/state/event behavior, not pixel layout).

**Decision**: **C** — supersedes an earlier "no UI tests" decision. Vitest + React Testing Library + jsdom infrastructure ships in this PR. Migration-chain unit tests cover `migrateDocument()` and each registered migration. Per-doc-type fixture files include a non-numeric `legacy` key for shapes without `version`. ~10 RTL component test files cover the load-bearing patterns: Dialog focus trap, OAuth result branching + linking flip, VerificationBanner threshold + per-uid dismiss, ProtectedRoute / OnboardingRoute tri-state, ProfileForm mode derivation + dual-write, HamburgerMenu narrowed `isOnboarding`, WellnessLog accumulator behavior + search-param fallback, ActivityCalendar tappable filter + memo invariant, DashboardHeaderSlide interval gating across `isOpen` + `prefers-reduced-motion`. Out of scope: E2E / Playwright, visual regression, snapshot tests, static-layout tests, chart-placeholder tests.

### Test conventions — colocation + shared helpers + jsdom defaults
**Decision**: (1) Tests and fixtures colocated with source (`foo.test.ts`, `foo.fixtures.ts` next to `foo.ts`); no top-level `__tests__/` or `tests/` tree. (2) Pure-logic tests run in node for fast startup; component tests opt into jsdom via `// @vitest-environment jsdom`. (3) Global `afterEach(() => { localStorage.clear(); sessionStorage.clear(); })` in `src/test/setup.ts`. (4) Shared `renderWithRouter(ui, { initialEntries })` helper in `src/test/router.tsx`. (5) Fake-timer convention: wrap timer advancement in `await act(async () => { vi.advanceTimersByTime(N) })` to avoid React 18/19 act warnings. (6) CSS-rule assertions: jsdom does not compute styles from CSS Modules — assert attribute-level state (`aria-*`, `disabled`, `tabindex`) and class-name presence (`toHaveClass(css.foo)`); CSS rule fidelity is verified manually in the viewport-matrix QA step.

### Migration error contract test — lives in `firestoreDocs.test.ts`
**Decision**: The catch happens in `readDoc`, so the test belongs in `src/utils/firestoreDocs.test.ts` (NOT in `migrations/index.test.ts`). Mock `getDoc`, register a throwing migration, call `readDoc(ref)`, assert `null` returned and `logError` called with `{ docPath, fromVersion: 1 }`. `migrations/index.test.ts` retains its registry-only scope.

### Per-doc-type fixtures include `legacy` key
**Decision**: Each fixtures file (`userProfile.fixtures.ts`, `wellnessEntry.fixtures.ts`, `performanceEntry.fixtures.ts`) includes a non-numeric `legacy` key for a shape without the `version` field. The round-trip test iterator distinguishes "version-keyed" fixtures from "shape-keyed" ones, and the `legacy` fixture exercises the framework's "missing `version` is treated as `1`" path end-to-end for each actual doc shape.

### Bundle-size report — gzip + brotli columns
**Context**: Vite's build log emits gzip numbers; what users actually download is brotli.
**Decision**: `tools/bundle-size-report.mjs` (Node, no system `brotli` binary required) prints two columns per artifact — gzip (`zlib.gzipSync` level 9) for cross-checking the build log; brotli (`zlib.brotliCompressSync` quality 11) for the realistic Firebase-Hosting-served numbers. Initial-JS row is `dist/assets/index-*.js`; precache-total row sums every file in the SW Workbox manifest (parsed from `dist/sw.js`). Output is a markdown table copy-pasteable into the PR description. `npm run report:bundle` script.

### Performance budget — soft, with revisit order
**Decision**: Soft budgets (gzipped initial JS ≤ 250 KB; total precache ≤ 500 KB) trigger a discussion, not an automatic block. PR description reports both numbers against `main` at branch point. Animation/frame-rate check is a measurement (recorded Chrome DevTools profile under 4× CPU + Slow 4G for ~10s spanning one motivation cycle), not a numeric gate. If the bundle budget is blown, **revisit `@dnd-kit` first** (it's the larger of the two) before widening the budget. Foundations-step pre-measure: `npm run build && gzip -9c dist/assets/index-*.js | wc -c`. If over, swap candidates in priority order — `zod` → `valibot` (~3 KB vs ~12-50 KB), then `@dnd-kit` lazy-loaded (re-opens the Lazy-loading discipline decision), then drop `@hookform/resolvers`.

### Per-cell QA acceptance script — golden path
**Decision**: 5 browsers × 8 widths = 40 cells; each cell deterministic in ~5 min via a 7-step script: (1) `/login` email/password sign-in; (2) new-user `/profile` + `/setup/tracking` with one drag-reorder; (3) `/dashboard` with at least one carousel rotation + a calendar-cell tap; (4) wellness log entry watching the chip transition `None → Some → All`; (5) hamburger → `/performance` log entry; (6) hamburger → `/about` confirming version + build timestamp; (7) hamburger → Log Out. **Pass** = no console errors, layout intact, `:focus-visible` outlines visible. **Fail** = any break, with one-line note + screenshot. PR description includes the matrix as a 5×8 table; iOS Safari × desktop-width combinations are N/A.

### Identity Platform upgrade — pre-merge confirmation
**Context**: Blocking functions are an Identity Platform feature, not legacy Firebase Auth. The Firebase CLI fast-fails the deploy if the project hasn't been upgraded.
**Decision**: Promote the Identity Platform note to a prominent ⚠️ Deployment prerequisite callout at the top of the Cloud Functions step, plus an explicit PR-description checklist item required before merge. The CLI deploy-error remains the underlying hard gate; the callout + PR checklist make it a pre-merge confirmation rather than a discover-on-CI surprise. Skipped a custom pre-deploy check script — Firebase's own error is sufficient and self-explanatory.

### `beforeUserCreated` over `beforeSignedIn`
**Decision**: `beforeUserCreated` fires on the first auth attempt for a given identity; if it rejects, no user record is created. `beforeSignedIn` would fire on every sign-in and is overkill — once the user is rejected at creation, they never have a record to sign back in with. Edge case: a Facebook user who initially shared email and later revoked it. If it becomes an issue, follow-up PR.

### CODAP route position — top-level sibling of AppShell layout route
**Context**: An earlier plan path-checked `pathname === '/codap'` inside `App.tsx` to render plain `<Routes>` outside the AppShell.
**Decision**: Use the canonical React Router layout-route pattern: `/codap` is a top-level `<Route>` sibling of the AppShell layout route, NOT a child. Route-tree position is what excludes it from AppShell — no path-checking elsewhere. Lazy-load via `React.lazy` + `<Suspense>` wrapping in the same place.

### `fetchSignInMethodsForEmail` — not called
**Context**: An earlier draft used the API to render the existing provider's name and only that provider's sign-in surface during the linking flow.
**Decision**: NOT called. The API leaks account existence and provider to an unauthenticated client (Google has deprecated it for this reason). The collision flow is method-agnostic: always show both Google and email/password options and let the user pick.

### `data-skip-link-exclude` attribute — cross-module discriminator
**Context**: CSS Module class names get hashed at build, so a class-name selector from AppShell would never match SectionHeading's hashed names.
**Decision**: SectionHeading chrome buttons carry `data-skip-link-exclude`. AppShell registers a one-shot focus shifter that, after the anchor jump, advances focus past any element with the attribute to the first content-area focusable.

### "Routing scaffold" wording — "the auth-screens step"
**Decision**: Replace ambiguous "the next step" references with explicit "the auth-screens step" since the immediately following step is now the Cloud Functions blocking trigger.

### `firebase.ts` Firestore + emulator + Analytics — single bullet
**Decision**: Cosmetic — merge two `src/firebase.ts` bullets in the migration framework step into one.

### `OnboardingRoute` `'loading'` gate — render `<Loading />`
**Decision**: `OnboardingRoute` mirrors `ProtectedRoute`'s loading gate: `'loading' → <Loading />`, `'error' → <ProfileLoadError />`. Only `'missing'` and `'loaded'` render the form. Net: ProfileForm and TrackedDataSetup only ever see settled load states. The mode-derivation does not need to handle `'loading'`.

### `HamburgerMenu` `isOnboarding` — narrowed branches
**Context**: `loadState.profile` access without narrowing is a TS error; `'loading'`-window default behavior was unspecified.
**Decision**: Three explicit branches: `'missing' → true`, `'loaded' → !profileComplete || !trackingSetupComplete`, `'loading' → false` (don't gate the menu before profile resolves). HamburgerMenu lives in AppShell outside ProtectedRoute / OnboardingRoute, so the `'loading'` branch is reachable during cold-start. Default `false` there: showing all menu items briefly is the right failure mode.

### ProfileForm onboarding submit — omit tracking flags
**Decision**: Onboarding submit calls `useUser().updateProfile({ ...values, profileComplete: true })` — explicitly omits `trackedWellnessMetrics`, `trackedPerformanceMetrics`, and `trackingSetupComplete`. `setDoc(merge:true)` leaves untouched fields alone, and TrackedDataSetup defaults to the full registry when these are `undefined`. Defense-in-depth: even if a regression lets a returning user reach this form via a stale load state, the onboarding submit can't clobber their tracking selections.

### `ActivityCalendar.test` — re-rendering stability
**Decision**: Memoization sanity test asserts that re-rendering with reference-equal `entries` and `trackedMetricIds` props does not re-invoke the per-cell completeness derivation. Catches a regression in the React.memo + useMemo seam.

### `DashboardHeaderSlide.test` — five behaviors
**Decision**: (1) advances on `ROTATION_MS` interval when not paused; (2) does NOT advance when `isOpen === true`; (3) does NOT advance when `mq.matches === true`; (4) firing `mq.change` toggles the timer without unmount; (5) unmount clears interval and removes the `mq.change` listener (no leak). All five together pin the spec snippet's behavior.

### `PASS-THROUGH` self-review concerns dismissed (no fresh OPEN entries)
**Decision**: Concerns considered and explicitly dismissed: routing-scaffold step diff-size shift (the soft target is a guideline; precedent stands); `aria-required` redundancy (`aria-invalid` + visible required marker covers the SR contract); double-announcement risk on form errors (standard a11y pattern, not a regression); `<Dialog>` body-scroll-lock composition under nested dialogs (the app never nests dialogs); `auth.currentUser` null check on ProfileForm submit (the form is gated by `ProtectedRoute` / `OnboardingRoute` — submit can't fire with `currentUser === null`).

### Color-only encoding on chip diagonal stripe — accept as-is
**Decision**: The chip styling (gradient stripe on `#007A84`) is preserved verbatim from the prototype-derived design. The shape distinction (solid vs diagonal stripe vs empty bordered) is the non-color cue. If low-contrast-vision users surface real complaints post-launch, contrast tuning lands as a follow-up.

### Single-PR atomicity — accepted, not revisited
**Decision**: ~17 steps and ~8500 LOC ships as a single PR. The bundle keeps the prototype-to-React port atomic so reviewers see the whole new shape at once and partial conversions can't end up in `main`. Per-step commits within the PR keep individual diffs reviewable.

### Initial-JS budget reporting — script lives in the final QA-gate step
**Decision**: Drop the `npm run report:bundle` mention from the Foundations gate. The Foundations-step Detail points directly at a single ad-hoc bash command (`npm run build && gzip -9c dist/assets/index-*.js | wc -c`) and notes that the canonical reusable script (gzip + brotli) lands later in the final QA-gate step. No wild-goose chase, no extra files in Foundations.
