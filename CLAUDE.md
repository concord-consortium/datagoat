# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For a high-level architectural tour (provider tree, routing, data model, optimistic writes, CODAP plugin flow, auth + blocking trigger, PWA), see [ARCHITECTURE.md](ARCHITECTURE.md). This file focuses on commands, conventions, and deploy-time gotchas.

## Commands

- `npm run dev` - Vite dev server (port 5173)
- `npm run build` - TypeScript check + production Vite build
- `npm run preview` - Preview production build locally
- `npm run emulators` - Firebase emulators (Auth 9099, Firestore 8080, Functions 5001, Hosting 5000)
- `npm run deploy` - Build and deploy hosting + functions + Firestore rules
- `npm run deploy:functions` - Redeploy only the Cloud Functions (e.g., to flip a kill-switch param)

Local dev requires two terminals: `npm run emulators` and `npm run dev`. Set `VITE_USE_EMULATORS=true` in `.env.local` to connect to emulators. The functions emulator runs the `beforeUserCreated` blocking trigger locally so the auth flows can exercise it without deploying.

No linter is configured. Tests run via `npm test` (Vitest, colocated `*.test.ts` / `*.test.tsx`).

### Cloud Functions — Identity Platform requirement

The `beforeUserCreated` blocking trigger that rejects Facebook sign-ins missing an email (`functions/src/auth/blockFacebookMissingEmail.ts`) requires Firebase Identity Platform. Before the first `firebase deploy --only functions` succeeds, an admin must upgrade the project once via the Firebase console: **Auth → Settings → "Upgrade to Identity Platform"**. Free tier covers up to 50K MAU. Without the upgrade, blocking-function deploys fail with an explicit Identity Platform error from the CLI. The local emulator runs the trigger regardless of upgrade state.

Kill switch: the trigger reads a `FACEBOOK_BLOCKER_ENABLED` runtime parameter (default `'true'`); set it to `'false'` in the Firebase console (Functions → Configuration) and run `npm run deploy:functions` to disable the rule without a code change. Existing instances pick up the new value on next cold-start.

#### Verifying the trigger is wired

The unit tests cover the rule's logic but can't see the trigger registration or SDK round-trip. Three layers cover the gap, each catching a different failure mode:

**1. Wire-level smoke (pre-deploy, manual)** - catches sentinel/trigger/kill-switch regressions on the raw HTTP response:
1. Start the emulator: `npm run emulators`
2. Run `npm --prefix functions run smoke:blocked-no-email` from repo root
3. Expect `OK: blocking trigger fired and [BLOCKED_NO_EMAIL] survived to the client.`

The smoke script POSTs a Facebook-shaped sign-in with no email to the auth emulator's `signInWithIdp` endpoint and asserts the rejection contains the sentinel.

**2. SDK round-trip test (auto-runs with `npm test`)** - catches Firebase JS SDK message-wrapping or truncation changes that would silently strip the sentinel from `err.message` at the client extractor:
- `src/components/auth/authProviders.emulator.test.ts` drives `signInWithCredential` against the auth emulator and runs the resulting error through the real `extractBlockedNoEmailMessage`. Skips automatically when the emulator is unreachable (the suite probes `127.0.0.1:9099` at module load).

**3. Post-deploy infrastructure checks (manual)** - catches deploy-time regressions the emulator can't see:
1. `firebase functions:list | grep blockFacebookMissingEmail` - confirm the function is deployed and the trigger type is `providers/cloud.auth/eventTypes/user.beforeCreate`
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

### Responsive layout

The app column width and height are controlled by media queries in `src/index.css` targeting `#root > main`. Component styles should not set their own width constraints beyond `max-width` on inner content (e.g., the login form uses `max-width: 320px`). Horizontal padding for all views comes from `.centered` in `common.module.css`.

## Conventions

- **CSS Modules** for component styles (`*.module.css`). Import as `css`: `import css from "./Foo.module.css"`. Shared styles live in `common.module.css`.
- **Global CSS** only in `index.css` (resets, responsive layout, surround styling).
- No em dashes - use regular hyphens.
- No Tailwind, DaisyUI, or CSS frameworks - vanilla CSS only.
- `APP_VERSION` and `APP_VERSION_DESC` constants in `App.tsx` control the version footer.

