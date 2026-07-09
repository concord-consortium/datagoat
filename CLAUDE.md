# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For a high-level architectural tour (provider tree, routing, data model, optimistic writes, CODAP plugin flow, auth + blocking trigger, PWA), see [ARCHITECTURE.md](ARCHITECTURE.md). This file focuses on commands, conventions, and deploy-time gotchas.

## Commands

- `npm run dev` - Vite dev server pointed at local Firebase emulators (port 5173)
- `npm run dev:staging` - Vite dev server pointed at the staging cloud project (no emulators required)
- `npm run dev:production` - Vite dev server pointed at the production cloud project (rare; for debugging a prod-only issue)
- `npm run build` - TypeScript check + production Vite build (alias for `build:production`)
- `npm run build:staging` - TypeScript check + staging Vite build
- `npm run build:production` - TypeScript check + production Vite build
- `npm run preview` - Preview the last build locally
- `npm run emulators` - Firebase emulators (Auth 9099, Firestore 8080, Functions 5001, Hosting 5000)
- `npm run deploy:staging` - Build and deploy hosting + functions + Firestore (rules + indexes) to staging
- `npm run deploy:production` - Build and deploy hosting + functions + Firestore (rules + indexes) to production
- `npm run deploy:staging:hosting` - Build and deploy only Firebase Hosting to staging
- `npm run deploy:production:hosting` - Build and deploy only Firebase Hosting to production
- `npm run deploy:staging:functions` - Redeploy only the Cloud Functions on staging (e.g., to flip a kill-switch param)
- `npm run deploy:production:functions` - Redeploy only the Cloud Functions on production
- `npm run deploy:preview -- <channel-name>` - Build (staging) and publish a Firebase Hosting preview channel on the staging project (30-day expiry; share the printed URL with stakeholders)

Default local dev uses two terminals: `npm run emulators` and `npm run dev`. The `dev` script runs `vite --mode emulators`, which loads `.env.emulators` (committed; sets `VITE_USE_EMULATORS=true` plus dummy `VITE_FIREBASE_*` values), so no per-developer config is needed for emulator work. The functions emulator runs the `beforeUserCreated` blocking trigger locally so the auth flows can exercise it without deploying.

To point the dev server at a real cloud project, use `npm run dev:staging` (the default "test against real cloud" target) or, rarely, `npm run dev:production` to debug a prod-only issue. These run `vite --mode staging` / `--mode production`, which load the committed `.env.staging` / `.env.production` files; those pull their `VITE_FIREBASE_*` config from non-`VITE_`-prefixed `FIREBASE_STAGING_*` / `FIREBASE_PRODUCTION_*` source vars in your `.env.local` via `${VAR}` expansion. No emulators need to be running. The explicit `--mode` is what makes these robust against a stale `VITE_USE_EMULATORS=true` in someone's legacy `.env.local`. See the [Environments](#environments) section for the full env-file pattern and why the `VITE_` prefix is omitted on the source vars.

No linter is configured. Tests run via `npm test` (Vitest, colocated `*.test.ts` / `*.test.tsx`).

### Cloud Functions — Identity Platform requirement

The `beforeUserCreated` blocking trigger that rejects Facebook sign-ins missing an email (`functions/src/auth/blockFacebookMissingEmail.ts`) requires Firebase Identity Platform. This upgrade is required **per project** — each of staging and production must be upgraded once via the Firebase console (**Auth → Settings → "Upgrade to Identity Platform"**, or any "Blocking functions" upgrade prompt) before that project's first functions deploy (`deploy:staging:functions` / `deploy:production:functions`) succeeds. Free tier covers up to 50K MAU. Without the upgrade, blocking-function deploys fail with an explicit Identity Platform error from the CLI. The local emulator runs the trigger regardless of upgrade state.

Kill switch: the trigger reads a `FACEBOOK_BLOCKER_ENABLED` runtime parameter (default `'true'`), which is **per project**. The deploy-time value comes from the committed `functions/.env.datagoat-<projectId>` files (`functions/.env.datagoat-staging`, `functions/.env.datagoat-b07dd`); set it to `'false'` in the relevant file (or in the Firebase console under Functions → Configuration) and run `npm run deploy:staging:functions` / `npm run deploy:production:functions` to disable the rule on that project without a code change. Flipping it on one project does not affect the other. Existing instances pick up the new value on next cold-start.

First-deploy gotcha — Artifact Registry cleanup policy: a project's **first** functions deploy prompts to set up an Artifact Registry cleanup policy (old build images otherwise accumulate). In non-interactive mode (`deploy:staging` / CI) the CLI skips the prompt and **exits non-zero** with a cleanup-policy error — and because that error short-circuits the run, a combined `deploy:staging` (hosting + functions + firestore) can finalize functions but leave the **hosting release un-finalized**, so the site serves a cached "Site Not Found" 404 despite "file upload complete". Fix once per project: `firebase functions:artifacts:setpolicy --days 1 --force --location <region> -P <staging|production>`. After the policy is set, subsequent deploys don't hit this. If you suspect a half-finalized hosting release, re-run `deploy:<env>:hosting` alone — it ends with `release complete` / `Deploy complete!` when the release is truly live.

#### Verifying the trigger is wired

The unit tests cover the rule's logic but can't see the trigger registration or SDK round-trip. Three layers cover the gap, each catching a different failure mode:

**1. Wire-level smoke (pre-deploy, manual)** - catches sentinel/trigger/kill-switch regressions on the raw HTTP response:
1. Start the emulator: `npm run emulators`
2. Run `npm --prefix functions run smoke:blocked-no-email` from repo root
3. Expect `OK: blocking trigger fired and [BLOCKED_NO_EMAIL] survived to the client.`

The smoke script POSTs a Facebook-shaped sign-in with no email to the auth emulator's `signInWithIdp` endpoint and asserts the rejection contains the sentinel.

**2. SDK round-trip test (auto-runs with `npm test`)** - catches Firebase JS SDK message-wrapping or truncation changes that would silently strip the sentinel from `err.message` at the client extractor:
- `src/components/auth/authProviders.emulator.test.ts` drives `signInWithCredential` against the auth emulator and runs the resulting error through the real `extractBlockedNoEmailMessage`. Skips automatically when the emulator is unreachable (the suite probes `127.0.0.1:9099` at module load).

**3. Post-deploy infrastructure checks (manual)** - catches deploy-time regressions the emulator can't see. Run these against whichever project you just deployed to (pass `-P staging` or `-P production`):
1. `firebase functions:list -P staging | grep blockFacebookMissingEmail` (or `-P production`) - confirm the function is deployed and the trigger type is `providers/cloud.auth/eventTypes/user.beforeCreate`
2. Firebase console → Auth → Settings - confirm the project still says "Identity Platform" (a downgrade silently disables blocking triggers)
3. Firebase console → Functions → `blockFacebookMissingEmail` → Configuration - confirm `FACEBOOK_BLOCKER_ENABLED` is `true` (unless you intentionally killed the rule)

## Architecture

React 19 + TypeScript + Vite PWA, deployed to Firebase Hosting. Firebase Auth (email/password + Google OAuth) with Firestore for data storage.

### App shell

`App.tsx` manages auth state via `onAuthStateChanged` and renders one of three views: `Loading`, `Login`, or `Authed`. The app is wrapped in a mobile-width container (max 640px) with three responsive tiers defined in `index.css`:
- **< 640px**: full viewport width
- **640-1023px**: centered column with side borders
- **≥ 1024px**: centered column capped at 95dvh, vertically centered
- Landscape phones (pointer: coarse, max-height: 500px) collapse to full width

### PWA / Service Worker

The PWA uses **NetworkFirst** for HTML (not precached) so deploys are visible immediately without manual reload. Static assets (JS, CSS, images) are precached with content-hashed filenames.

Key behaviors in `main.tsx`:
- Warms the "pages" runtime cache on first visit so offline works immediately
- Checks for SW updates on `visibilitychange` (fixes home-screen PWA staleness)
- Auto-reloads when a new SW takes control (skips first install)

`sw.js` and `registerSW.js` use `Cache-Control: no-store` in `firebase.json` to prevent CDN caching.

### Firebase

`firebase.ts` initializes the app from `VITE_*` env vars and connects to emulators when `VITE_USE_EMULATORS=true`. Firestore rules enforce user-level access (`/users/{userId}/**`); anything outside that path is default-denied. Writes are intentionally allowed for unverified accounts - verification is non-blocking per spec.

## Environments

DataGOAT has two Firebase projects:

| Concern | Staging | Production |
|---|---|---|
| Project ID | `datagoat-staging` | `datagoat-b07dd` |
| Default URL | `datagoat-staging.web.app` | `datagoat-b07dd.web.app` |
| Firestore data | Test data only; safe to drop/reset | Real user data |
| Preview channels | Live here | Not used |

Both projects deploy the same Firestore rules, schema, and Cloud Functions code. Staging exists for pre-release QA, stakeholder demos, and destructive testing against real Firebase cloud (not emulators). There is no separate cloud "dev" project — developers use the emulators for day-to-day work and staging when they need real cloud.

### Env-file pattern

Per-developer **source-of-truth** Firebase config lives in `.env.local` (untracked) as **non-`VITE_`-prefixed** vars, one set per environment:

```
FIREBASE_STAGING_*       # staging project's config values
FIREBASE_PRODUCTION_*    # production project's config values
```

The committed `.env.staging` and `.env.production` files map these into the `VITE_FIREBASE_*` vars the app reads, via Vite's `${VAR}` expansion (dotenv-expand):

```
VITE_FIREBASE_API_KEY=${FIREBASE_STAGING_API_KEY}
```

The `VITE_` prefix is intentionally **omitted** on the source vars: Vite only exposes `VITE_`-prefixed vars to the client bundle, so prefixing the source vars would bundle *both* project IDs into *every* build. Keeping them unprefixed means each mode-scoped build (`--mode staging` / `--mode production`) emits exactly one project's config. `src/firebase.ts` reads `VITE_FIREBASE_*` generically and is unchanged by this scheme. Copy `.env.example` to `.env.local` and fill in both sets of values from the Firebase console (or the team password-manager entry).

### Deploy scripts

Deploy scripts are **suffixed by environment** — there is no unsuffixed `deploy`. Production deploys must be typed explicitly (`deploy:production`), so no one ships to prod by reflex:

- `deploy:staging` / `deploy:production` — hosting + functions + Firestore (rules + indexes)
- `deploy:staging:hosting` / `deploy:production:hosting` — hosting only
- `deploy:staging:functions` / `deploy:production:functions` — functions only

`.firebaserc` maps `staging` → `datagoat-staging` and `production` → `datagoat-b07dd`; its `default` alias points at staging so a stray `firebase deploy` with no `-P` flag resolves to staging, not production.

### Preview channels

`npm run deploy:preview -- <channel-name>` builds with `--mode staging` and publishes to the **staging** project, so preview channels share staging's auth and Firestore — safe to share with stakeholders without touching production users.

## Styling guide

This section explains how to find and change visual styles in the app.

### Where styles live

Each component has its own CSS Module file next to it. To change how a specific component looks, edit its `.module.css` file:

| To style... | Edit this file |
|---|---|
| Login form layout overrides | `src/components/auth/LoginForm.module.css` |
| Signup form layout overrides | `src/components/auth/SignupForm.module.css` |
| Auth-screen chrome (logo, accent line, headings) | `src/components/auth/AuthLayout.module.css` |
| Social sign-in buttons + "or" divider | `src/components/auth/SocialButtons.module.css` |
| Password input + eye toggle + forgot link | `src/components/auth/PasswordField.module.css` |
| Field primitives (input, label, error, hint) | `src/components/form/fields.module.css` |
| CTA buttons (primary teal, secondary outline) | `src/components/form/buttons.module.css` |
| Loading screen | `src/components/Loading.module.css` |
| App container | `src/App.module.css` |
| Shared utilities (visually-hidden, skip link) | `src/components/common.module.css` |
| Page background, responsive breakpoints, design tokens | `src/index.css` |

### How to change a component's style

1. Find the component in `src/components/`. The class names in the JSX (e.g., `css.button`) map to class names in the adjacent `.module.css` file.
2. Edit the `.module.css` file directly. CSS Modules scope class names to the component, so changes won't affect other components.
3. If the style is shared across components (like the centered layout or page title), edit `common.module.css` instead.

### Current color values

| Usage | Value |
|---|---|
| Page surround background | `#eef2f6` |
| Content column background | `#ffffff` |
| Column border | `1px solid #d6dde3` |
| Button background | `#f5f5f5` |
| Button text | `#0693e3` |
| Button border | `1px solid #d6dde3` |
| Error text | `#e53e3e` |
| Muted text (email, footer) | `#666` / `#999` |

### Button styling

All buttons use `appearance: none` to reset browser defaults (required for consistent rendering on iOS Safari). When adding new buttons, include these properties to avoid platform inconsistencies: `appearance`, `font-size`, `font-family: inherit`, `background`, `border`, `border-radius`, `color`.

### Form controls

Default to the shared primitives - `TextField` and `SelectField` (`src/components/form/`) - for any text/email/tel/number/url input or dropdown. They carry the label association, aria wiring, `.has-value` toggle, and dark-theme styling from `fields.module.css`.

The rule differs by element:

- **`<select>`: never raw.** `SelectField` covers every case, so there is no legitimate bare `<select>` outside `src/components/form/`. A CI test enforces this - see `src/components/form/noRawSelect.test.ts`.
- **`<input>`: raw is fine only when styled.** A bare `<input>` is acceptable when it either (a) is a type the wrappers don't cover - radio, checkbox, color - or (b) still carries the shared `fields.*` classes (`fieldInput`, `fieldLabel`, ...) or lives in a CSS-module that styles it via scoped tag selectors matching those primitives (see `CustomMetricLevelsEditor.module.css`'s `.table input[type="text"]`). Examples of legitimately-raw inputs: the auth email fields (RHF, `fields.fieldInput`), `NumericInput` / `TimeInput` (bespoke grouped/adorned inputs), the profile unit-suffix fields.

What's banned is an **unstyled** native control that skips *both* the wrapper and the shared styling - it renders unstyled against the dark background (the defect the custom-metric Time row shipped with). New form UI should look identical to its neighbors: read the sibling fields in the same file before hand-rolling markup.

### Responsive layout

The app column width and height are controlled by media queries in `src/index.css` targeting `#root > main`. Component styles should not set their own width constraints beyond `max-width` on inner content (e.g., the login form uses `max-width: 320px`). Horizontal padding for all views comes from `.centered` in `common.module.css`.

### CSS conventions

- **CSS Modules** for component styles (`*.module.css`). Import as `css`: `import css from "./Foo.module.css"`. Shared styles live in `common.module.css`.
- **Global CSS** only in `index.css` (resets, responsive layout, surround styling).
- **Vanilla CSS only.** No Tailwind, DaisyUI, or other utility-first frameworks. CSS custom properties (declared at `:root` in `index.css`) cover variables; CSS Modules cover scoping.
- **No SCSS / no preprocessors.** The "no framework" rule extends to preprocessors. Concord's wider team norm of SCSS is intentionally diverged from for this project.
- **No CSS nesting (`&`).** The implicit browser support floor is Vite's default `'modules'` baseline (no `browserslist` declared, no `build.target` override). Native CSS nesting requires Safari 16.5+/FF 117+/Chrome 120+, above that floor. Revisit if/when a higher floor is declared.
- **Tag selectors inside class scopes use bare names** (`.foo strong`). Don't wrap them in `:global()`. CSS Modules only hash classes and ids; tag selectors pass through unchanged. `:global()` is only needed to reach a class/id defined outside the module.
- **Conditional classNames go through `clsx()`** rather than hand-rolled template-literal concatenation. `clsx(css.btn, isActive && css.active, error && css.error)` is the convention.
- **Font-family is tokenized at `:root`** as `--font-body` and `--font-display`. Use `var(--font-body)` / `var(--font-display)` rather than restating font-family stacks per component.

### Other conventions

- No em dashes - use regular hyphens.
- `APP_VERSION` and `APP_VERSION_DESC` constants in `App.tsx` control the version footer.

## Git conventions

- **Multi-line commit messages and PR bodies: write the text to a temp file and pass it with `-F`** (`git commit -F <file>`, `gh pr create --body-file <file>`). Do NOT use heredocs (`$(cat <<'EOF' ... )`) - they fail to parse in this environment, especially when chained with `&&` or when the body contains apostrophes/`<...>`. Going straight to a file avoids the retry every time.
- Commit subjects follow Conventional Commits with the Jira key suffixed in brackets: `fix(profile): start required selects unselected [DGT-39]`.

