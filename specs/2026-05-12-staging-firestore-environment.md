# Staging Firestore Environment — Design

**Date:** 2026-05-12
**Status:** Proposed (in review)
**Owner:** Kirk Swenson

## Background

DataGOAT currently has a single Firebase project, `datagoat-b07dd`, used as production. There is no separate staging environment. As a result:

- Pre-release verification has to happen either against emulators (which miss deploy-time issues like Identity Platform, OAuth callbacks, and Firestore indexes) or against the live production project (risking real user data).
- Stakeholder demos and PR preview channels currently land on production, sharing auth and Firestore with real users.
- Destructive testing (data migrations, schema changes, admin operations) has nowhere safe to run.

`.firebaserc` already lists aliases `staging: datagoat-staging` and `production: datagoat-production`, but **neither project exists** — `package.json` deploy scripts hardcode `-P datagoat-b07dd`, bypassing the aliases.

## Goals

Stand up a real second Firebase project to serve as the staging environment and update the repo so that:

1. Pre-release QA can be done against real Firebase cloud (not emulators).
2. Stakeholder demos and preview channels have a stable URL that doesn't share state with real production users.
3. Destructive testing (migrations, schema work) has a safe target.
4. Deploys to staging vs. production are explicit and unambiguous — production deploys must be opted into by name.

## Non-goals

- **No CI auto-deploys.** Both environments stay manual.
- **No third "dev" cloud project.** Developers continue to use Firebase emulators for day-to-day work; staging is the cloud target when they need real cloud.
- **No data migration** from production to staging. Staging starts empty; data is test-only.
- **No custom domain** for staging. Default `*.web.app` URL is fine to start.
- **No changes to Firestore rules or schema.** Same rules deploy to both projects.

## Two-environment outcome

| Concern | Staging | Production |
|---|---|---|
| Firebase project ID | `datagoat-staging` (new) | `datagoat-b07dd` (existing) |
| Default URL | `datagoat-staging.web.app` | `datagoat-b07dd.web.app` |
| Identity Platform | Enabled (new) | Enabled (already) |
| OAuth providers | New Google + Facebook OAuth credentials | Existing |
| Hosting preview channels | Live here | Not used |
| Firestore data | Test data only; safe to drop/reset | Real user data; sacred |
| Auth users | Separate accounts | Separate accounts |

The staging project ID may end up named slightly differently (e.g. `datagoat-staging-xxxxx` if the bare ID is taken). The exact final ID will be confirmed during the manual setup step and propagated through `.firebaserc` and `.env.local`. The spec uses `datagoat-staging` as the placeholder throughout.

---

## Phase 0: Manual Firebase / GCP console setup (one-time, gating prereq)

These steps must happen before any code change is useful.

1. **Create the Firebase project** in the Firebase console.
   - Name: `datagoat-staging` (or the closest available variant).
   - Same GCP billing account as production (shares Identity Platform's free-tier MAU pool).
   - Match production's Firestore region. To find it: Firebase console → `datagoat-b07dd` → Firestore Database → settings icon → "Location" field.

2. **Enable services:** Firestore, Authentication, Hosting, Cloud Functions.

3. **Upgrade Auth → Identity Platform.** Required for the `beforeUserCreated` blocking trigger. Without this, the first `deploy:staging:functions` will fail with the same Identity Platform error CLAUDE.md already documents for production. Free tier covers 50K MAU.

4. **Configure auth providers in the staging project:**
   - **Email/password** — toggle on; no extra config.
   - **Google OAuth** — create a new OAuth 2.0 Client ID in the staging project's GCP console. Authorized redirect URIs: `https://datagoat-staging.firebaseapp.com/__/auth/handler` and `https://datagoat-staging.web.app/__/auth/handler`. Authorized JavaScript origins: `https://datagoat-staging.web.app`. Paste client ID + secret into Firebase Auth Google provider config.
   - **Facebook OAuth** — register a new platform (or new app) in the Facebook developer console with OAuth redirect URI `https://datagoat-staging.firebaseapp.com/__/auth/handler`. Paste Facebook App ID + secret into Firebase Auth.

5. **Register a Web App** in the staging project (Firebase console → Project settings → Your apps). Copy the seven config values (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, `measurementId`) for the env-file step in Phase 1.

6. **Verify the kill switch defaults.** The `FACEBOOK_BLOCKER_ENABLED` runtime parameter defaults to `'true'` from the code; no manual setup needed.

**OAuth callback note:** Firebase Auth uses the project's `authDomain` (`datagoat-staging.firebaseapp.com`) as the OAuth callback host regardless of which hosting channel served the page. Preview channels like `datagoat-staging--pr-42-abc.web.app` redirect through `datagoat-staging.firebaseapp.com`, so providers don't need per-channel allowlist entries — only the base auth domain.

---

## Phase 1: Repo configuration

### 1a. `.firebaserc`

```json
{
  "projects": {
    "default": "datagoat-staging",
    "staging": "datagoat-staging",
    "production": "datagoat-b07dd"
  }
}
```

Three deliberate choices:
- `production` now correctly maps to the existing `datagoat-b07dd` project.
- `staging` maps to the new project ID (final value pulled in during Phase 0 step 1).
- `default` is itself a top-level alias whose value must be a concrete project ID, not another alias name. Pointing it at `datagoat-staging` (the staging project ID) is the safety rail: a stray `firebase deploy` with no `-P` flag resolves to staging, not production. The npm scripts always pass `-P` explicitly, so this only matters for ad-hoc CLI use.

### 1b. Env files — variable indirection through `.env.local`

Vite loads `.env` files in this order (later overrides earlier):
1. `.env`
2. `.env.local`
3. `.env.[mode]`
4. `.env.[mode].local`

Vite ≥ 3.0 supports `${VAR}` expansion via dotenv-expand across this load chain. So variables defined in `.env.local` can be referenced from a later-loaded `.env.[mode]` file.

**Important:** Vite only exposes `VITE_`-prefixed vars to the client bundle. If the source-of-truth variables in `.env.local` used the `VITE_` prefix, *every* build would bundle both the staging and production project IDs, undermining the "correct project enforced" property. Therefore the source variables in `.env.local` **do not use the `VITE_` prefix.** They live in the build-time environment only, drive expansion, and are filtered out of the client bundle.

**`.env.local`** (untracked, per-developer):
```bash
# Source-of-truth Firebase config for both environments.
# NO VITE_ prefix - these are expansion sources used only at build time
# and must not leak into client bundles.

FIREBASE_STAGING_API_KEY=...
FIREBASE_STAGING_AUTH_DOMAIN=datagoat-staging.firebaseapp.com
FIREBASE_STAGING_PROJECT_ID=datagoat-staging
FIREBASE_STAGING_STORAGE_BUCKET=datagoat-staging.firebasestorage.app
FIREBASE_STAGING_MESSAGING_SENDER_ID=...
FIREBASE_STAGING_APP_ID=...
FIREBASE_STAGING_MEASUREMENT_ID=...

FIREBASE_PRODUCTION_API_KEY=...
FIREBASE_PRODUCTION_AUTH_DOMAIN=...
FIREBASE_PRODUCTION_PROJECT_ID=...
FIREBASE_PRODUCTION_STORAGE_BUCKET=...
FIREBASE_PRODUCTION_MESSAGING_SENDER_ID=...
FIREBASE_PRODUCTION_APP_ID=...
FIREBASE_PRODUCTION_MEASUREMENT_ID=...
```

Real values must never be committed — each developer fills in their own `.env.local` from the secrets channel the team uses for these (e.g., the password manager entry created when the staging project ships). Copy values verbatim from the Firebase console; in particular, the storage bucket name may be in the legacy `*.appspot.com` form on older projects or the newer `*.firebasestorage.app` form on projects created after the migration. The example above uses the newer form, but the literal value from the console is what should be in `.env.local`.

**`.env.staging`** (committed):
```bash
VITE_USE_EMULATORS=false
VITE_FIREBASE_API_KEY=${FIREBASE_STAGING_API_KEY}
VITE_FIREBASE_AUTH_DOMAIN=${FIREBASE_STAGING_AUTH_DOMAIN}
VITE_FIREBASE_PROJECT_ID=${FIREBASE_STAGING_PROJECT_ID}
VITE_FIREBASE_STORAGE_BUCKET=${FIREBASE_STAGING_STORAGE_BUCKET}
VITE_FIREBASE_MESSAGING_SENDER_ID=${FIREBASE_STAGING_MESSAGING_SENDER_ID}
VITE_FIREBASE_APP_ID=${FIREBASE_STAGING_APP_ID}
VITE_FIREBASE_MEASUREMENT_ID=${FIREBASE_STAGING_MEASUREMENT_ID}
```

**`.env.production`** (committed): identical shape, `STAGING` → `PRODUCTION`.

**`.env.emulators`** (committed): keeps `VITE_USE_EMULATORS=true` and adds dummy `VITE_FIREBASE_*` values, matching the pattern already used by `.env.test`. `src/firebase.ts` unconditionally calls `initializeApp` with `VITE_FIREBASE_*` before `connectAuthEmulator` / `connectFirestoreEmulator` override the endpoints, so the values must be defined even though their content doesn't matter at runtime. Use `demo-datagoat` as the project ID for consistency with the `npm run emulators` script:

```bash
VITE_USE_EMULATORS=true
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-datagoat.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-datagoat
VITE_FIREBASE_STORAGE_BUCKET=demo-datagoat.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000000000
VITE_FIREBASE_MEASUREMENT_ID=
```

**`.env.cloud`** (committed): **delete.** Superseded by `.env.staging` for the common "test against real cloud safely" case and `.env.production` for the rare "debug a prod-only issue" case.

**`.env.example`** (committed): rewrite to show the new `FIREBASE_STAGING_*` / `FIREBASE_PRODUCTION_*` source-var pattern and a brief comment explaining the indirection and why the `VITE_` prefix is intentionally omitted on source vars.

### 1c. `src/firebase.ts`

**No changes.** It reads `VITE_FIREBASE_*` generically. The mode-driven aliasing flows through invisibly.

---

## Phase 2: npm script changes

Final `scripts` block in `package.json`:

```json
{
  "dev": "vite --mode emulators",
  "dev:staging": "vite --mode staging",
  "dev:production": "vite --mode production",
  "build": "npm run build:production",
  "build:staging": "tsc -b && vite build --mode staging",
  "build:production": "tsc -b && vite build --mode production",
  "preview": "vite preview",
  "emulators": "firebase emulators:start --only auth,firestore,hosting,functions --project=demo-datagoat --import=./firebase-data --export-on-exit",
  "deploy:staging": "npm run build:staging && firebase deploy --only hosting,functions,firestore -P staging",
  "deploy:production": "npm run build:production && firebase deploy --only hosting,functions,firestore -P production",
  "deploy:staging:hosting": "npm run build:staging && firebase deploy --only hosting -P staging",
  "deploy:production:hosting": "npm run build:production && firebase deploy --only hosting -P production",
  "deploy:staging:functions": "firebase deploy --only functions -P staging",
  "deploy:production:functions": "firebase deploy --only functions -P production",
  "deploy:preview": "npm run build:staging && firebase hosting:channel:deploy --expires 30d -P staging",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui",
  "report:bundle": "node tools/bundle-size-report.mjs"
}
```

Key design choices:

- **`dev:cloud` is removed.** Replaced by `dev:staging` (the new "test against real cloud" default) and `dev:production` (rare; only for debugging a prod-only issue).
- **`build` is kept as an alias for `build:production`.** Bundle-size reports, the README, and any external tooling already reference `npm run build`; keeping it functional avoids a wide doc sweep. The alias means `build` is always production, so it's predictable.
- **No unsuffixed `deploy` / `deploy:hosting` / `deploy:functions` aliases.** Production deploys must be typed explicitly as `deploy:production`. Mild muscle-memory retraining, big safety win: no one ships to prod by reflex.
- **`deploy:preview` builds with `--mode staging` and deploys to `-P staging`.** Preview channels live on staging, so they share staging's auth and Firestore — safe for sharing with stakeholders.
- **`deploy:staging` includes `firestore`** so both rules and indexes ship alongside hosting + functions. The pre-existing `deploy` script in `package.json` uses `firestore:rules` (rules only), which matches the current empty `firestore.indexes.json` but would silently drop composite indexes once any are added. Using the bare `firestore` token here future-proofs the deploy. Same for `deploy:production`.

---

## Phase 3: Code reference updates

`codapUrl.ts` uses `window.location.origin` directly — no logic depends on the project name. Only example strings need updating.

**`src/codap/codapUrl.ts:17`** — change the example URL in the comment:
```diff
-// channels (e.g. datagoat-production--pr-3-abc.web.app), so CODAP
+// channels (e.g. datagoat-staging--pr-3-abc.web.app), so CODAP
```

**`src/codap/codapUrl.test.ts:49-51`** — update the preview-channel fixture string:
```diff
-stubLocation("https://datagoat-production--pr-3-abc.web.app/codap");
+stubLocation("https://datagoat-staging--pr-3-abc.web.app/codap");
 expect(buildCodapWrappedUrl()).toBe(
-  "https://codap3.concord.org?di=https://datagoat-production--pr-3-abc.web.app/codap",
+  "https://codap3.concord.org?di=https://datagoat-staging--pr-3-abc.web.app/codap",
 );
```

The test asserts pass-through of whatever hostname is set, so the value is documentation-only; updating it keeps the example honest now that previews actually live on the staging project.

A grep of `src/` and `functions/` for `datagoat-b07dd`, `datagoat-staging`, `datagoat-production` should be run during implementation as a belt-and-suspenders check. Current grep results show only the two locations above plus `.firebaserc` and `package.json`.

---

## Phase 4: Documentation updates

### `CLAUDE.md` — new "Environments" section

Add a top-level section (between "Architecture" and "Styling guide") titled `## Environments` that consolidates:

- The two-environment model (staging + production) with project IDs.
- The env-file pattern: `.env.local` holds source-of-truth `FIREBASE_STAGING_*` / `FIREBASE_PRODUCTION_*` vars; `.env.staging` / `.env.production` (committed) alias them via `${VAR}` expansion; the `VITE_` prefix is intentionally omitted on source vars to prevent both project IDs leaking into every client bundle.
- The deploy-script naming convention (suffixed by environment; no unsuffixed `deploy` alias).
- The preview-channel target (staging).

### `CLAUDE.md` — Commands section

- Add `dev:staging`, `dev:production`, `build:staging`, `build:production`, `deploy:staging`, `deploy:production`, `deploy:staging:hosting`, `deploy:production:hosting`, `deploy:staging:functions`, `deploy:production:functions`.
- Remove the `dev:cloud` description.
- Update the `deploy:preview` description to say "deploys to the staging project."
- Rewrite the paragraph explaining `.env.emulators` / `.env.cloud` / `.env.local` to describe the new pattern. Cross-link to the new Environments section.

### `CLAUDE.md` — Cloud Functions / Identity Platform section

- State that the Identity Platform upgrade is required **per project** — staging needs its own upgrade before `deploy:staging:functions` will succeed the first time.
- State that `FACEBOOK_BLOCKER_ENABLED` is a per-project runtime parameter — flipping the staging kill switch doesn't affect production and vice versa.

### `CLAUDE.md` — Verifying the trigger is wired

- Wire-level smoke (`smoke:blocked-no-email`): no change (emulator-based).
- SDK round-trip test: no change.
- Post-deploy infrastructure checks now apply to **both** projects. Add a sentence: "Run these checks against whichever project you just deployed to (`firebase functions:list -P staging` or `-P production`)."

### `ARCHITECTURE.md`

Grep during implementation for `datagoat-b07dd` or single-project framing ("the Firebase project"). If found, update to reflect the two-environment model. Otherwise leave alone.

### `README.md`

Grep during implementation for any deploy or env-setup section. Mirror the CLAUDE.md edits as needed. Otherwise leave alone.

### `.env.example`

Rewrite to the new layout (Phase 1b), with explanatory comments.

---

## Phase 5: Validation

After implementation, before declaring done, run this checklist top to bottom. Each item catches a different failure mode.

**Build-time validation** (catches env-file / mode-selection bugs):
1. `npm run build:staging` succeeds. Grep `dist/assets/*.js` — confirm `datagoat-staging` appears, `datagoat-b07dd` does **not**. (Proves the `VITE_`-prefix-drop worked.)
2. `npm run build:production` succeeds. Inverse grep: `datagoat-b07dd` appears, `datagoat-staging` does not.
3. `npm run build` (the alias) produces output matching `build:production`.

**Dev-server validation** (catches mode-flag wiring):
4. `npm run dev` → emulators (no change from today).
5. `npm run dev:staging` → app loads; browser Network tab shows requests to `datagoat-staging` Firestore + auth endpoints.
6. `npm run dev:production` → app loads; Network tab shows `datagoat-b07dd` endpoints.

**Test-suite validation:**
7. `npm test` — all existing tests pass with the updated codap fixture strings.
8. `npm --prefix functions test` — passes.
9. `npm --prefix functions run smoke:blocked-no-email` — passes against running emulators.

**Deploy validation** (the real test — catches GCP-side gaps):
10. `npm run deploy:staging` succeeds end-to-end. Functions deploy confirms staging Identity Platform upgrade landed. Hosting deploy confirms the SPA bundle reaches `datagoat-staging.web.app`.
11. Visit `datagoat-staging.web.app`. Sign up with email/password, then sign in with Google, then sign in with Facebook. Each proves the respective OAuth credential is wired in the staging project.
12. Attempt a Facebook sign-in with email scope omitted. Confirm rejection with the `[BLOCKED_NO_EMAIL]` sentinel in the client error. Post-deploy version of the wire-level smoke check.
13. Create a metric definition; reload the page; confirm it persists. Proves Firestore + rules + indexes deployed to staging.
14. `firebase functions:list -P staging | grep blockFacebookMissingEmail` returns the function with trigger type `providers/cloud.auth/eventTypes/user.beforeCreate`.

**Preview-channel validation:**
15. `npm run deploy:preview -- test-channel` creates `datagoat-staging--test-channel-<hash>.web.app`. Visit it; sign in; verify Firestore reads/writes work. Confirms the preview-channel relocation didn't break OAuth callbacks.

**Production smoke** (separate, lighter — confirm we didn't regress prod during cutover):
16. `npm run deploy:production` on a benign no-op change (e.g., after a merge that doesn't touch functions or rules) succeeds. Existing prod users still load the app.

---

## Open questions for implementation

None blocking. A couple of small decisions to confirm during execution:

- **Final staging project ID.** `datagoat-staging` is the placeholder. If that bare ID is taken in the Firebase project namespace, the closest available variant (e.g. `datagoat-staging-<region>`) gets used. Propagated through `.firebaserc` and `.env.local`.
- **Whether to add `--mode staging` to `preview` script.** Currently the `preview` npm script is `vite preview` with no mode. It serves whatever was last built. If the last build was production, `vite preview` shows production. This is fine for now (low-stakes; you usually know what you just built) but flagged for future polish.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| OAuth credentials misconfigured on staging, sign-in silently broken | Validation step 11 exercises all three providers before declaring done. |
| Identity Platform upgrade forgotten on staging, `deploy:staging:functions` fails | Documented in Phase 0 step 3 and CLAUDE.md edits. First failure is loud and actionable. |
| Source-of-truth var renamed by a future contributor with `VITE_` prefix added back, leaking both project IDs into every bundle | Validation step 1 grep catches it. Phase 1b comment in `.env.example` explains why the prefix is omitted. |
| `default: datagoat-staging` in `.firebaserc` masks a production-intended `firebase deploy` typo, deploying to staging when prod was intended | Acceptable. The npm scripts always pass `-P` explicitly. The default only fires on ad-hoc CLI use, where deploying to staging is safer than the alternative of silently shipping to prod. |
| `.env.cloud` deletion breaks an in-flight worktree on someone's machine | Low — the file is currently only referenced by the now-removed `dev:cloud` script. A pre-deletion grep confirms no other references. |
| Existing CODAP test references `datagoat-production` literal that future readers think is real | Phase 3 fixes the fixture string. |

## What this spec does not cover

- The actual implementation plan (sequencing, commits, branch strategy). That comes from the writing-plans skill next.
- Custom domain setup for staging (deferred).
- Storage bucket configuration (not in scope).
- Per-channel OAuth allowlisting (not needed — Firebase Auth routes all OAuth callbacks through the base authDomain).
- Automated promotion from staging to production (out of scope; manual deploys are the chosen model).
