# DataGOAT

Own Your Sports Data for Peak Performance.

A mobile-first PWA for student athletes to track daily health metrics, sport outcomes, and earn badges for consistency. Built with React, TypeScript, Vite, and Firebase.

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

## Available Scripts

| Script              | Description                                         |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Start Vite dev server with hot reload               |
| `npm run build`     | TypeScript check + production Vite build            |
| `npm run preview`   | Preview the production build locally                |
| `npm run emulators` | Start Firebase emulators (Auth, Firestore, Hosting) |
| `npm run deploy`    | Build and deploy to Firebase Hosting                |

## Tech Stack

- **React 19** + TypeScript + Vite
- **Firebase** — Authentication (email/password), Firestore, Hosting
- **vite-plugin-pwa** for service worker and offline support
