# DataGOAT Architecture

A high-level tour of how the app is wired together, intended for a developer picking up the codebase. For commands, conventions, and deploy-time gotchas see [CLAUDE.md](CLAUDE.md). For day-to-day setup see [README.md](README.md).

## Tech stack

- **React 19** + **TypeScript** + **Vite** (PWA via `vite-plugin-pwa`)
- **Firebase** — Auth (email/password + Google + Facebook), Firestore, Hosting, Cloud Functions (Identity Platform blocking trigger)
- **react-router-dom 7**, **react-hook-form** + **zod**, **@dnd-kit** (sortable metric lists)
- **@concord-consortium/codap-plugin-api** for the CODAP integration
- **Vitest** + **@testing-library/react** for tests (colocated `*.test.ts(x)`)

No linter is configured. No CSS framework — vanilla CSS Modules per component, with shared tokens / responsive layout in [src/index.css](src/index.css). See [CLAUDE.md](CLAUDE.md#css-conventions) for the full set of CSS conventions (no SCSS, no nesting, `clsx` for conditional classes, font-family tokens).

## App shell

[src/main.tsx](src/main.tsx) is the only entry point. Before React mounts it does two top-level things:

1. **CODAP redirect** — if the URL is `/codap` and we are not inside an iframe, replace the URL with the CODAP-wrapped form (`https://codap3.concord.org?di=<our-origin>/codap`). See [src/codap/codapUrl.ts](src/codap/codapUrl.ts). This means a bookmark / shared link / refresh of `/codap` always lands inside CODAP.
2. **Service-worker registration** — skipped on `/codap` (offline support inside the CODAP iframe is meaningless and the SW would conflict with the parent origin's caching expectations). On all other routes the SW is registered, the current page is warmed into the `pages` runtime cache, and `visibilitychange` triggers `reg.update()` so home-screen PWA installs aren't stale.

[src/App.tsx](src/App.tsx) then composes the provider tree:

```
BrowserRouter
  └─ AuthProvider     ── onAuthStateChanged → { user, loading, signOut }
       └─ UserProvider     ── /users/{uid}/profile/main snapshot → loadState
            └─ DataProvider    ── healthEntries + competitionEntries snapshots
                 └─ AppRoutes
```

Each provider subscribes to Firestore via `onSnapshot` and exposes a discriminated-union load state (`loading | missing | loaded | error` for the profile, `loading | loaded` for the data collections). Components branch on `loadState.status` rather than reading nullable fields directly. See [src/contexts/](src/contexts/).

## Routing

[src/routes/AppRoutes.tsx](src/routes/AppRoutes.tsx) defines the route tree. The top-level shape is deliberate:

```
<Routes>
  <Route path="/codap" element={<Suspense><CodapPlugin/></Suspense>} />   ← lazy-loaded, no AppShell
  <Route element={<AppShell/>}>                                            ← all other routes
    <Route element={<RedirectIfAuthed/>}>
      /login, /signup, /forgot-password
    </Route>
    /verify-email                                                          ← intentionally outside RedirectIfAuthed
    <Route element={<OnboardingRoute/>}>
      /profile, /setup/tracking, /info/:topic
    </Route>
    <Route element={<ProtectedRoute/>}>
      /dashboard, /health, /health/:metricId, /competition,
      /competition/:metricId, /add-metric/:type, /about
    </Route>
  </Route>
</Routes>
```

- **`/codap` is a sibling of `<AppShell>`, not a child.** Position in the route tree is what excludes it from the AppHeader, hamburger menu, and verification banner — there is no path-based `if (pathname === '/codap')` check anywhere in the shell.
- **`<CodapPlugin>` is the only `React.lazy` seam** — this keeps `@concord-consortium/codap-plugin-api` out of the initial bundle for users who never visit `/codap`.
- **`<ProtectedRoute>`** redirects unauthed users to `/login` and redirects authed users with `loadState.status === 'missing'` to `/profile` (onboarding entry point).
- **`<OnboardingRoute>`** is laxer: it gates only on `loadState !== 'loading'` so users with `status === 'missing'` can still reach the profile form. Without this they would loop forever.

[src/routes/AppShell.tsx](src/routes/AppShell.tsx) renders the document chrome: skip-link, sticky `<header>` (either `DashboardHeaderSlide` on `/dashboard` or the static `AppHeader`), scrollable `<main>`, and the `HamburgerMenu` Dialog. It also installs a global `focusin` handler that auto-scrolls focused elements into view (with sticky-chrome compensation and `prefers-reduced-motion` honoring) for keyboard / SR users.

## Auth

Firebase Auth is used directly — there is no FirebaseUI wrapper.

Three sign-in methods, all defined in [src/components/auth/authProviders.ts](src/components/auth/authProviders.ts) and consumed by [LoginForm](src/components/auth/LoginForm.tsx), [SignupForm](src/components/auth/SignupForm.tsx), and [CodapPluginSignIn](src/codap/CodapPluginSignIn.tsx):

1. **Email + password** — standard `signInWithEmailAndPassword` / `createUserWithEmailAndPassword`.
2. **Google OAuth** — `signInWithPopup(googleProvider)`.
3. **Facebook OAuth** — `signInWithPopup(facebookProvider)` with `email` scope. Users can deny the email scope; the [`blockFacebookMissingEmail`](functions/src/auth/blockFacebookMissingEmail.ts) Cloud Function rejects those sign-ins server-side.

`signInWithProvider` returns a discriminated-union result that the forms branch on:

- `{ ok: true, user }` → success
- `{ ok: false, kind: "account-collision", email, pendingCredential }` → opens the inline [LinkAccountPanel](src/components/auth/LinkAccountPanel.tsx) (e.g., user signed up with Google but is now trying Facebook on the same email)
- `{ ok: false, kind: "blocked-no-email", message }` → server rejected the Facebook sign-in. The blocking trigger throws an `HttpsError` whose message starts with the `[BLOCKED_NO_EMAIL]` sentinel; `extractBlockedNoEmailMessage` recovers it from the wrapped `auth/internal-error`.
- `{ ok: false, kind: "other", code }` → mapped to user-facing copy in [authErrorMessages.ts](src/components/auth/authErrorMessages.ts)

**Verification is non-blocking.** A newly-signed-up user is dropped into the app immediately; [VerificationBanner](src/components/auth/VerificationBanner.tsx) is the only nudge. Firestore rules also do not gate on `email_verified` — the trust boundary is `request.auth.uid == userId`. The CODAP plugin is the one place where verification IS gated client-side (sign-in is blocked until the user verifies via the main app), but that is UI-only.

### Cloud Function: `blockFacebookMissingEmail`

[functions/src/auth/blockFacebookMissingEmail.ts](functions/src/auth/blockFacebookMissingEmail.ts) is a `beforeUserCreated` Identity Platform trigger. On every sign-in attempt it inspects `event.data.providerData`; if the request is from `facebook.com` and `event.data.email` is missing/empty, it throws an `HttpsError` with the `[BLOCKED_NO_EMAIL]` sentinel.

- The pure rule (`evaluateBlockFacebookMissingEmail`) is unit-tested without the Functions runtime.
- A `FACEBOOK_BLOCKER_ENABLED` runtime parameter acts as a kill switch — flip it to `'false'` in the Firebase console and run `npm run deploy:staging:functions` / `npm run deploy:production:functions` to disable on that project without a code change.
- Identity Platform must be enabled on the project before the first deploy. See CLAUDE.md "Cloud Functions — Identity Platform requirement" for the upgrade procedure and the three-layer verification strategy (wire-level smoke, SDK round-trip test, post-deploy console checks).

## Data model

All app data lives under `/users/{uid}/` in Firestore:

| Path | Shape |
| --- | --- |
| `/users/{uid}/profile/main` | Singleton [`UserProfile`](src/types/profile.ts) — name, email, age, height, weight, gender, athlete type, competition term, tracked metric ID lists, completion flags |
| `/users/{uid}/healthEntries/{YYYY-MM-DD}` | One [`HealthEntry`](src/types/data.ts) per day — hydration, sleepTime, sleepEfficiency, protein, leanMass, availability tree |
| `/users/{uid}/competitionEntries/{YYYY-MM-DD}` | One [`CompetitionEntry`](src/types/data.ts) per day — `metrics: Record<string, number \| string>` keyed by metric id |

The doc id IS the date string, which is what makes the per-date upsert trivially correct (no separate query for "today's row"). One entry per metric per day is intentional — see COMPETITION LOG UI for the daily TOTAL column users log against (two-a-day training, prelim+final track days, AM/PM splits all collapse into the day's total). The health side is the same shape for the same reason.

[firestore.rules](firestore.rules) has two match blocks. The user-scoped block — `allow read, write: if request.auth != null && request.auth.uid == userId` over `/users/{userId}/{document=**}` — covers everything under a user's tree; subcollections inherit owner-only access automatically. The top-level `/metricDefinitions/{metricId}` block scopes custom-metric definitions per-user via `ownerId == request.auth.uid` (and pins `ownerId` on create/update so a doc can't be transferred to another account). Anything outside these paths is default-denied.

### Schema migrations

[src/migrations/](src/migrations/) implements a small per-doc-type migration framework. Each registered migration takes a `v_n` document and returns its `v_(n+1)` shape, and `migrateDocument(docType, raw)` walks the chain from `raw.version` up to current. Today no migrations are registered; the framework is in place for the first schema bump.

Two contracts that are easy to break:

1. **Migrations must be idempotent.** `DataContext` stamps `version: CURRENT_*_VERSION` on every partial-merge write, so a stale tab can write a downgraded version onto a doc that already has newer-shape fields. The next reader re-runs the migration on a doc that already has the new shape — non-idempotent migrations corrupt data.
2. **Every registered migration needs a fixture in [migrations/index.test.ts](src/migrations/index.test.ts).** A coverage meta-test fails the suite if a registered migration is missing its fixture. See the long comment in [migrations/types.ts](src/migrations/types.ts) for the full protocol when v1 → v2 actually lands.

The version-stamp itself is gated to avoid version churn: `firestoreSetHealthEntry` / `firestoreSetCompetitionEntry` in [DataContext.tsx](src/contexts/DataContext.tsx) only stamp `version` when the server doc is unknown to us (creation) or known to be older (upgrade). The "known server version" cache is populated pre-migration off each `onSnapshot` tick.

## Optimistic writes

`DataContext` is the most subtle part of the app. Reads are straightforward (one `onSnapshot` per collection, filtered to the last 365 days), but writes are debounced + optimistic + reconciled. The health and competition paths are **structurally identical** — same pending map, same per-date debounce timers, same reconciliation logic, same version-stamp gating. The only difference is which sub-tree gets deep-merged on partial accumulation (`availability` for health, `metrics` for competition):

1. `setHealthEntry(date, partial)` / `setCompetitionEntry(date, partial)` immediately update a per-collection pending map keyed by date, then schedule a 500 ms timer to flush. All consumers see the optimistic merge synchronously via the `health` / `competition` `useMemo` (server snapshot ⊕ pending overlay).
2. The flush calls `setDoc(..., { merge: true })` against the date's doc in the appropriate subcollection (`healthEntries` or `competitionEntries`).
3. The next server-acked `onSnapshot` (filtered with `metadata.hasPendingWrites === false`) drives **reconciliation**: each pending field that now matches the server is dropped; mismatches stay pending. Pending entries are NEVER dropped at flush time — reconciliation against authoritative state is the only source of truth for "this write landed."
4. Multiple writes within the debounce window deep-merge per-sub-key — `availability` sub-fields for health (so a pending `{ practiceHeld: true }` doesn't wipe `gameHeld`), and the `metrics` bag for competition (so typing into one competition metric input doesn't clobber the values for adjacent inputs).

A few load-bearing details:

- **Per-date timers** so navigating dates mid-typing flushes each date independently.
- **Provider-unmount flush** is declared in an effect *before* the `[user]` cleanup effects so React's declaration-order cleanup runs the flush before the user-change cleanup wipes pending state. Sign-out does NOT flush (the prior session is gone; writes would be rejected by rules and optimistic state is intentionally lost).
- **A synchronous re-entry gate (`sendingRef`) on the CODAP send button** prevents a rapid double-click from interleaving two sendDataset cycles before the React `disabled={sending}` flip commits.

## CODAP plugin flow

CODAP (`https://codap3.concord.org`) embeds plugins in iframes and talks to them over `postMessage`. DataGOAT exposes itself as a CODAP plugin at the `/codap` route, which is loaded inside CODAP via the URL `https://codap3.concord.org?di=https://datagoat.concord.org/codap`.

### Entry paths

There are three ways into the plugin, and the system handles all of them through one route:

1. **Dashboard "Analyze in CODAP" button** ([CodapButton](src/components/dashboard/CodapButton.tsx)) — opens the CODAP-wrapped URL directly in a new tab on desktop. This is the fast path: no datagoat.concord.org bundle-load + redirect hop. On mobile (< 640px) it opens an explanatory modal because CODAP itself is desktop-only.
2. **Direct visit / bookmark of `/codap`** — caught by the [main.tsx](src/main.tsx) iframe-aware redirect, bounced to the CODAP-wrapped URL, lands back at `/codap` inside an iframe, and renders.
3. **Devs debugging the panel** — `/codap?noredirect=1` skips the redirect and renders the plugin top-level for inspection.

Both top-level callers share `buildCodapWrappedUrl()` from [src/codap/codapUrl.ts](src/codap/codapUrl.ts), which resolves the `di=` origin to localhost in dev and `datagoat.concord.org` in prod.

### Inside the iframe

The iframe gets a fresh, **storage-partitioned** IndexedDB. That means the plugin iframe **cannot see the top-level datagoat.concord.org tab's Firebase Auth session** — it must run its own sign-in flow. [CodapPluginSignIn](src/codap/CodapPluginSignIn.tsx) renders a slimmed-down login form that mirrors LoginForm's three sign-in methods but stays inside the plugin shell (no router navigation, no AuthLayout chrome). Sign-up and forgot-password open the main app in a new tab rather than duplicating those flows in-plugin.

The plugin renders one of three branches off the `useAuth()` state ([CodapPlugin.tsx](src/codap/CodapPlugin.tsx)):

- **No user** → `<CodapPluginSignIn>`
- **User with `emailVerified === false`** → `<CodapPluginUnverified>`. The user must verify in the main app at `/verify-email` and reload the plugin. This gate is UI-only — the security boundary is still the Firestore rule, which doesn't gate on email_verified.
- **Verified user** → `<CodapPluginAuthed>`, which reads `useUser()` and `useHealthData() / useCompetitionData()` and renders the dataset-selection panel.

### `useCodapApi` and `sendDataset`

[src/codap/codapApi.ts](src/codap/codapApi.ts) is the thin DataGOAT-specific wrapper around `@concord-consortium/codap-plugin-api`:

1. `useCodapApi()` calls `initializePlugin()` once on mount, tracking a `disconnected | connecting | connected` status. The library handles the underlying `postMessage` handshake.
2. `sendDataset()` orchestrates the multi-step "send a dataset to CODAP" dance:
   - **First send for a name** — `getDataContext(name)` returns `success: false`, so we call the lower-level `codapInterface.sendRequest({ action: 'create', resource: 'dataContext', ... })` to create the data context with name + title + a single collection containing the typed attributes. (The library's `createDataContext` helper only accepts a name and can't set the `title`, which is what CODAP uses as the visible table-tab label.) Then `createTable(name)` opens a case-table component so the rows are actually visible.
   - **Re-send with a populated rows array** — the data context exists, so we reconcile attribute types in case the first send was empty (e.g., a column was inferred `categorical` for lack of samples and we can now infer `numeric`). We don't downgrade types on empty re-sends.
   - **Upsert by `date`** — `getAllItems(name)` builds a `date → itemId` map; rows whose date matches an existing item are sent through `updateItemByID`, the rest are appended via `createItems`. This is what makes the CODAP table stay in sync with the user's daily logs across re-sends. If the user has manually duplicated rows in CODAP, only the first match per key is updated and a console warning surfaces the divergence.
3. `healthEntryToRow` / `competitionEntryToRow` in [CodapPlugin.tsx](src/codap/CodapPlugin.tsx) do the entry → flat-row conversion. The health `availability` sub-tree is flattened to a single string (e.g., `"practice:played / no-game"`) so the CODAP cell is human-readable at a glance.

## Charts

The chart engine lives in [src/charts/](src/charts/). [MetricChart](src/charts/MetricChart.tsx) is the public seam — it owns the SVG `role="img"` wiring, the `<title>` / `<desc>` a11y contract, the loading skeleton, and the visually-hidden `<ChartDataTable>` with its "Show data" toggle. Inside that SVG, [MetricBarChart](src/charts/MetricBarChart.tsx) is a thin orchestrator that computes geometry + scale once and composes five focused subcomponents — [Axes](src/charts/Axes.tsx), [Bars](src/charts/Bars.tsx), [TodayGhost](src/charts/TodayGhost.tsx), [GoalLineAndBadge](src/charts/GoalLineAndBadge.tsx), [AverageBadge](src/charts/AverageBadge.tsx) — inside a single `<g>` group. Render order is bars → today-ghost → axes → goal → avg, so the axis lines paint over any bar pixel that touches them and the avg badge sits on top of everything.

[metricChartConfig.ts](src/charts/metricChartConfig.ts) is the single source of truth for per-metric chart settings: `chartType`, axis range, axis inversion (Hydration's 1..8 urine-color scale displays low values at the top), value formatter, optional `unit` + `isLongUnit` flag (long units like `"g/kg"` stack on a second line and drop from the goal badge), `avgDecimals`, `nullsCountAsZero` (used by Availability), and the `random(rng)` generator that powers demo mode. The config is the right place to add per-metric chart concerns; [MetricDefinition](src/metrics/types.ts) stays focused on the metric registry (name, icon, who-collects-it, etc.).

### Adding a new metric to the chart engine

Three files, in order:

1. Add the metric to [src/metrics/healthMetrics.ts](src/metrics/healthMetrics.ts) or [competitionMetrics.ts](src/metrics/competitionMetrics.ts) with name, icon, descriptions.
2. Add an entry to `CONFIG` in [metricChartConfig.ts](src/charts/metricChartConfig.ts) — for competition metrics, `competitionConfig(yBottomRaw, yTopRaw)` is the factory; for health metrics define the config object explicitly.
3. If the metric needs a profile-keyed goal (different goal per Gender × AthleteType), add a field to [`ChartGoals`](src/data/profileVariants.ts), populate the four canonical profile entries, and add a switch case to `lookupGoalLine` in [chartSeries.ts](src/charts/chartSeries.ts). Otherwise set `goalRaw` directly on the chart config and the static-fallback path in `lookupGoalLine` picks it up.

### Goal resolution

[`lookupGoalLine(metricId, profileKey)`](src/charts/chartSeries.ts) resolves the chart's goal line in raw units. Per-profile values from `PROFILE_CHART_GOALS` win; metrics without a per-profile entry fall back to `metricChartConfig[metricId].goalRaw`; if neither is set the goal line and badge don't render. Both [DashboardChartCard](src/components/dashboard/DashboardChartCard.tsx) and [MetricDetail](src/charts/MetricDetail.tsx) use the same lookup — they don't gate on metric type.

### Adding the line-chart variant

The `type: "line" | "bar"` prop on `MetricChart` already exists; `type === "line"` currently renders a "Line chart not yet implemented" note. To slot in a real line variant, add a `LineLayer` (sibling of `Bars`) that walks the same date-aligned `value: number | null` series and emits a `<polyline>` + `<circle>` per non-null point, then have a `MetricLineChart` orchestrator compose it with the existing `Axes`, `GoalLineAndBadge`, and `AverageBadge` subcomponents — those three are already metric-shape agnostic. `MetricChart` routes to the new orchestrator when `type === "line"`.

### Demo mode

[`DemoModeProvider`](src/contexts/DemoModeContext.tsx) reads `?demo` from the URL once at mount; once set, the flag is sticky for the session (navigation that drops the param doesn't kick the user out). [`useChartSeries`](src/charts/useChartSeries.ts) reads the context and either calls `buildAlignedSeries` (real data from Firestore) or generates a seeded random series with a 20% null rate. Random values are seeded by `(SESSION_SEED, metricId, dayOffset)` so the data is stable within a session but varies between sessions. The richer scenario-driven demo system in [DGT-30](https://concord-consortium.atlassian.net/browse/DGT-30) replaces the random generator without touching the chart engine.

## PWA / service worker

Configured in [vite.config.ts](vite.config.ts) (`vite-plugin-pwa`) with two intentional choices:

- **HTML uses `NetworkFirst` (not precached)** so deploys are visible immediately without manual reload.
- **Static assets (JS / CSS / images) are precached** with content-hashed filenames.

[firebase.json](firebase.json) sets `Cache-Control: no-store` on `/sw.js` and `/registerSW.js` to prevent CDN caching of the service worker itself, and `Cache-Control: no-cache` on `/index.html`. Long-lived `/assets/**` get `max-age=31536000, immutable`.

`main.tsx` also installs a `controllerchange` listener that auto-reloads when a new SW takes control (skipping the first install) so users don't need to manually refresh after a deploy.

## Local development

Two terminals: `npm run emulators` (Firebase Auth :9099, Firestore :8080, Functions :5001, Hosting :5000) and `npm run dev` (Vite :5173). The `dev` script runs `vite --mode emulators`, which loads `.env.emulators` (committed; sets `VITE_USE_EMULATORS=true` plus dummy `VITE_FIREBASE_*` values), so no per-developer config is needed for emulator work. To run the dev server against a real cloud project instead, use `npm run dev:staging` (or `npm run dev:production` to debug a prod-only issue; no emulators required). The `beforeUserCreated` blocking trigger runs locally in the functions emulator regardless of Identity Platform upgrade state, so the Facebook-no-email rejection path can be exercised without deploying.

The Firestore SDK uses `persistentLocalCache` with the multi-tab manager so offline writes survive tab close / reload — the PWA can be used on the sideline with no connection.

## Testing

Vitest with `@testing-library/react`, colocated `*.test.ts(x)` next to source. Two notable test categories:

- **Unit tests** for hooks, contexts, utilities, the migration framework, and individual components. Run via `npm test`.
- **Emulator-dependent SDK round-trip tests** (e.g. [authProviders.emulator.test.ts](src/components/auth/authProviders.emulator.test.ts)) auto-skip when `127.0.0.1:9099` is unreachable. They drive the real Firebase JS SDK against the emulator to catch wrapper / message-truncation regressions that pure unit tests can't see.

For the blocking trigger specifically, three layers cover what a single unit test can't (wire registration, SDK message-wrapping, and post-deploy infra). See the "Verifying the trigger is wired" section in CLAUDE.md.

## Deployment

`npm run deploy:staging` / `npm run deploy:production` run the matching `vite build --mode …` then `firebase deploy --only hosting,functions,firestore -P staging` (or `-P production`). Hosting serves the `dist/` SPA build with the rewrite `** → /index.html`. `npm run deploy:staging:functions` / `npm run deploy:production:functions` redeploy only the Cloud Functions, useful for flipping the kill-switch param without a code change. There is no unsuffixed `deploy` — production deploys are always typed explicitly. See the Environments section of [CLAUDE.md](CLAUDE.md) for the two-project model and env-file pattern.

`APP_VERSION` and `APP_VERSION_DESC` in [src/App.tsx](src/App.tsx) drive the version footer.
