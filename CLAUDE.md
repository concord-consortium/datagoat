# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` - Vite dev server (port 5173)
- `npm run build` - TypeScript check + production Vite build
- `npm run preview` - Preview production build locally
- `npm run emulators` - Firebase emulators (Auth 9099, Firestore 8080, Hosting 5000)
- `npm run deploy` - Build and deploy to Firebase Hosting

Local dev requires two terminals: `npm run emulators` and `npm run dev`. Set `VITE_USE_EMULATORS=true` in `.env.local` to connect to emulators.

No test framework is configured yet. No linter is configured.

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

`firebase.ts` initializes the app from `VITE_*` env vars and connects to emulators when `VITE_USE_EMULATORS=true`. Firestore rules enforce user-level access (`/users/{userId}/**`) and admin-only writes to `/config/**`.

## Styling guide

This section explains how to find and change visual styles in the app.

### Where styles live

Each component has its own CSS Module file next to it. To change how a specific component looks, edit its `.module.css` file:

| To style... | Edit this file |
|---|---|
| Login form (buttons, inputs, labels, layout) | `src/components/Login.module.css` |
| Authenticated view (user info display) | `src/components/Authed.module.css` |
| Sign-out button | `src/components/Logout.module.css` |
| Loading screen | `src/components/Loading.module.css` |
| App container and version footer | `src/App.module.css` |
| Shared layout (centered containers, page titles) | `src/components/common.module.css` |
| Page background, responsive breakpoints, borders | `src/index.css` |

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

