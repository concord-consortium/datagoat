# DataGOAT

Own Your Sports Data for Peak Performance

A mobile-first PWA for student athletes to track daily health metrics, sport outcomes, and earn badges for consistency. Built with React, Firebase, Tailwind CSS, and DaisyUI.

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

   The required variables are:

   ```
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   ```

   When running against the Firebase emulator, these values can be any placeholder — the app auto-connects to the emulator in dev mode.

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

The app will automatically connect to the local emulators when running in development mode.

### Seeding Default Data

To populate the emulator's Firestore with default metrics, sport mappings, and badge definitions:

```bash
npm run seed
```

This uses a merge strategy — it adds new entries without overwriting existing ones.

### Setting an Admin User

To grant admin access to a user (for the admin dashboard):

```bash
node scripts/set-admin.js user@example.com
```

## Available Scripts

| Script                | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `npm run dev`         | Start Vite dev server with hot reload                 |
| `npm run build`       | TypeScript check + production Vite build              |
| `npm run preview`     | Preview the production build locally                  |
| `npm run lint`        | Run ESLint                                            |
| `npm run emulators`   | Start Firebase emulators (Auth, Firestore, Hosting)   |
| `npm run seed`        | Seed Firestore with default config data               |
| `npm run deploy:staging`    | Build and deploy to Firebase Hosting (staging)  |
| `npm run deploy:production` | Build and deploy to Firebase Hosting (production) |

## Tech Stack

- **React 19** + TypeScript + Vite
- **Tailwind CSS v4** + **DaisyUI v5** (custom `datagoat` theme)
- **Firebase** — Authentication (email/password), Firestore (offline persistence), Hosting
- **Chart.js** + react-chartjs-2 + chartjs-plugin-annotation
- **vite-plugin-pwa** for service worker and offline support
