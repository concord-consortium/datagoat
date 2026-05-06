# DataGOAT Architecture

A high-level tour of how the app is wired together, intended for a developer picking up the codebase. For commands, conventions, and deploy-time gotchas see [CLAUDE.md](CLAUDE.md). For day-to-day setup see [README.md](README.md).

## Tech stack

- **React 19** + **TypeScript** + **Vite** (PWA via `vite-plugin-pwa`)
- **Firebase** — Auth (email/password + Google + Facebook), Firestore, Hosting, Cloud Functions (Identity Platform blocking trigger)
- **react-router-dom 7**, **react-hook-form** + **zod**, **@dnd-kit** (sortable metric lists)
- **@concord-consortium/codap-plugin-api** for the CODAP integration
- **Vitest** + **@testing-library/react** for tests (colocated `*.test.ts(x)`)

No linter is configured. No CSS framework — vanilla CSS Modules per component, with shared tokens / responsive layout in [src/index.css](src/index.css).

## App shell

[src/main.tsx](src/main.tsx) is the only entry point. Before React mounts it does two top-level things:

1. **CODAP redirect** — if the URL is `/codap` and we are not inside an iframe, replace the URL with the CODAP-wrapped form (`https://codap3.concord.org?di=<our-origin>/codap`). See [src/codap/codapUrl.ts](src/codap/codapUrl.ts). This means a bookmark / shared link / refresh of `/codap` always lands inside CODAP.
2. **Service-worker registration** — skipped on `/codap` (offline support inside the CODAP iframe is meaningless and the SW would conflict with the parent origin's caching expectations). On all other routes the SW is registered, the current page is warmed into the `pages` runtime cache, and `visibilitychange` triggers `reg.update()` so home-screen PWA installs aren't stale.

[src/App.tsx](src/App.tsx) then composes the provider tree:

```
BrowserRouter
  └─ AuthProvider     ── onAuthStateChanged → { user, loading, signOut }
       └─ UserProvider     ── /users/{uid}/profile/main snapshot → loadState
            └─ DataProvider    ── wellnessEntries + performanceEntries snapshots
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
      /dashboard, /wellness, /wellness/:metricId, /performance,
      /performance/:metricId, /add-metric/:type, /about
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
- A `FACEBOOK_BLOCKER_ENABLED` runtime parameter acts as a kill switch — flip it to `'false'` in the Firebase console and run `npm run deploy:functions` to disable without a code change.
- Identity Platform must be enabled on the project before the first deploy. See CLAUDE.md "Cloud Functions — Identity Platform requirement" for the upgrade procedure and the three-layer verification strategy (wire-level smoke, SDK round-trip test, post-deploy console checks).

## Data model

All app data lives under `/users/{uid}/` in Firestore:

| Path | Shape |
| --- | --- |
| `/users/{uid}/profile/main` | Singleton [`UserProfile`](src/types/profile.ts) — name, email, age, height, weight, gender, athlete type, competition term, tracked metric ID lists, completion flags |
| `/users/{uid}/wellnessEntries/{YYYY-MM-DD}` | One [`WellnessEntry`](src/types/data.ts) per day — hydration, sleepTime, sleepEfficiency, protein, leanMass, availability tree |
| `/users/{uid}/performanceEntries/{YYYY-MM-DD}` | One [`PerformanceEntry`](src/types/data.ts) per day — `metrics: Record<string, number \| string>` keyed by metric id |

The doc id IS the date string, which is what makes the per-date upsert trivially correct (no separate query for "today's row"). One entry per metric per day is intentional — see PERFORMANCE LOG UI for the daily TOTAL column users log against (two-a-day training, prelim+final track days, AM/PM splits all collapse into the day's total). The wellness side is the same shape for the same reason.

[firestore.rules](firestore.rules) is one match block: `allow read, write: if request.auth != null && request.auth.uid == userId` over `/users/{userId}/{document=**}`. Every user-scoped subcollection inherits owner-only access automatically; anything outside that path is default-denied.

### Schema migrations

[src/migrations/](src/migrations/) implements a small per-doc-type migration framework. Each registered migration takes a `v_n` document and returns its `v_(n+1)` shape, and `migrateDocument(docType, raw)` walks the chain from `raw.version` up to current. Today no migrations are registered; the framework is in place for the first schema bump.

Two contracts that are easy to break:

1. **Migrations must be idempotent.** `DataContext` stamps `version: CURRENT_*_VERSION` on every partial-merge write, so a stale tab can write a downgraded version onto a doc that already has newer-shape fields. The next reader re-runs the migration on a doc that already has the new shape — non-idempotent migrations corrupt data.
2. **Every registered migration needs a fixture in [migrations/index.test.ts](src/migrations/index.test.ts).** A coverage meta-test fails the suite if a registered migration is missing its fixture. See the long comment in [migrations/types.ts](src/migrations/types.ts) for the full protocol when v1 → v2 actually lands.

The version-stamp itself is gated to avoid version churn: `firestoreSetWellnessEntry` / `firestoreSetPerformanceEntry` in [DataContext.tsx](src/contexts/DataContext.tsx) only stamp `version` when the server doc is unknown to us (creation) or known to be older (upgrade). The "known server version" cache is populated pre-migration off each `onSnapshot` tick.

## Optimistic writes

`DataContext` is the most subtle part of the app. Reads are straightforward (one `onSnapshot` per collection, filtered to the last 365 days), but writes are debounced + optimistic + reconciled. The wellness and performance paths are **structurally identical** — same pending map, same per-date debounce timers, same reconciliation logic, same version-stamp gating. The only difference is which sub-tree gets deep-merged on partial accumulation (`availability` for wellness, `metrics` for performance):

1. `setWellnessEntry(date, partial)` / `setPerformanceEntry(date, partial)` immediately update a per-collection pending map keyed by date, then schedule a 500 ms timer to flush. All consumers see the optimistic merge synchronously via the `wellness` / `performance` `useMemo` (server snapshot ⊕ pending overlay).
2. The flush calls `setDoc(..., { merge: true })` against the date's doc in the appropriate subcollection (`wellnessEntries` or `performanceEntries`).
3. The next server-acked `onSnapshot` (filtered with `metadata.hasPendingWrites === false`) drives **reconciliation**: each pending field that now matches the server is dropped; mismatches stay pending. Pending entries are NEVER dropped at flush time — reconciliation against authoritative state is the only source of truth for "this write landed."
4. Multiple writes within the debounce window deep-merge per-sub-key — `availability` sub-fields for wellness (so a pending `{ practiceHeld: true }` doesn't wipe `gameHeld`), and the `metrics` bag for performance (so typing into one performance metric input doesn't clobber the values for adjacent inputs).

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
- **Verified user** → `<CodapPluginAuthed>`, which reads `useUser()` and `useWellnessData() / usePerformanceData()` and renders the dataset-selection panel.

### `useCodapApi` and `sendDataset`

[src/codap/codapApi.ts](src/codap/codapApi.ts) is the thin DataGOAT-specific wrapper around `@concord-consortium/codap-plugin-api`:

1. `useCodapApi()` calls `initializePlugin()` once on mount, tracking a `disconnected | connecting | connected` status. The library handles the underlying `postMessage` handshake.
2. `sendDataset()` orchestrates the multi-step "send a dataset to CODAP" dance:
   - **First send for a name** — `getDataContext(name)` returns `success: false`, so we call the lower-level `codapInterface.sendRequest({ action: 'create', resource: 'dataContext', ... })` to create the data context with name + title + a single collection containing the typed attributes. (The library's `createDataContext` helper only accepts a name and can't set the `title`, which is what CODAP uses as the visible table-tab label.) Then `createTable(name)` opens a case-table component so the rows are actually visible.
   - **Re-send with a populated rows array** — the data context exists, so we reconcile attribute types in case the first send was empty (e.g., a column was inferred `categorical` for lack of samples and we can now infer `numeric`). We don't downgrade types on empty re-sends.
   - **Upsert by `date`** — `getAllItems(name)` builds a `date → itemId` map; rows whose date matches an existing item are sent through `updateItemByID`, the rest are appended via `createItems`. This is what makes the CODAP table stay in sync with the user's daily logs across re-sends. If the user has manually duplicated rows in CODAP, only the first match per key is updated and a console warning surfaces the divergence.
3. `wellnessEntryToRow` / `performanceEntryToRow` in [CodapPlugin.tsx](src/codap/CodapPlugin.tsx) do the entry → flat-row conversion. The wellness `availability` sub-tree is flattened to a single string (e.g., `"practice:played / no-game"`) so the CODAP cell is human-readable at a glance.

## PWA / service worker

Configured in [vite.config.ts](vite.config.ts) (`vite-plugin-pwa`) with two intentional choices:

- **HTML uses `NetworkFirst` (not precached)** so deploys are visible immediately without manual reload.
- **Static assets (JS / CSS / images) are precached** with content-hashed filenames.

[firebase.json](firebase.json) sets `Cache-Control: no-store` on `/sw.js` and `/registerSW.js` to prevent CDN caching of the service worker itself, and `Cache-Control: no-cache` on `/index.html`. Long-lived `/assets/**` get `max-age=31536000, immutable`.

`main.tsx` also installs a `controllerchange` listener that auto-reloads when a new SW takes control (skipping the first install) so users don't need to manually refresh after a deploy.

## Local development

Two terminals: `npm run emulators` (Firebase Auth :9099, Firestore :8080, Functions :5001, Hosting :5000) and `npm run dev` (Vite :5173). Set `VITE_USE_EMULATORS=true` in `.env.local` to make the app connect to the emulators. The `beforeUserCreated` blocking trigger runs locally in the functions emulator regardless of Identity Platform upgrade state, so the Facebook-no-email rejection path can be exercised without deploying.

The Firestore SDK uses `persistentLocalCache` with the multi-tab manager so offline writes survive tab close / reload — the PWA can be used on the sideline with no connection.

## Testing

Vitest with `@testing-library/react`, colocated `*.test.ts(x)` next to source. Two notable test categories:

- **Unit tests** for hooks, contexts, utilities, the migration framework, and individual components. Run via `npm test`.
- **Emulator-dependent SDK round-trip tests** (e.g. [authProviders.emulator.test.ts](src/components/auth/authProviders.emulator.test.ts)) auto-skip when `127.0.0.1:9099` is unreachable. They drive the real Firebase JS SDK against the emulator to catch wrapper / message-truncation regressions that pure unit tests can't see.

For the blocking trigger specifically, three layers cover what a single unit test can't (wire registration, SDK message-wrapping, and post-deploy infra). See the "Verifying the trigger is wired" section in CLAUDE.md.

## Deployment

`npm run deploy` runs `vite build` then `firebase deploy --only hosting,functions,firestore:rules -P datagoat-b07dd`. Hosting serves the `dist/` SPA build with the rewrite `** → /index.html`. `npm run deploy:functions` redeploys only the Cloud Functions, useful for flipping the kill-switch param without a code change.

`APP_VERSION` and `APP_VERSION_DESC` in [src/App.tsx](src/App.tsx) drive the version footer.
