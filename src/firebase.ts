import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
});

export const auth = getAuth(app);

// Persistent IndexedDB cache so offline writes survive tab close / reload -
// required for a PWA where the user may log data on the sideline with no
// connection. The multi-tab manager lets the cache be shared between the
// installed PWA and any open browser tabs without one of them silently
// degrading to memory-only. If IndexedDB is unavailable (Safari private
// browsing, etc.) the SDK falls back to memory automatically.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

let emulatorConnected = false;
if (
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_EMULATORS === "true" &&
  !emulatorConnected
) {
  emulatorConnected = true;
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 8080);
}

let analyticsPromise: Promise<Analytics | null> | null = null;

export function getAnalyticsLazy(): Promise<Analytics | null> {
  if (analyticsPromise === null) {
    analyticsPromise = isSupported()
      .then((supported) => (supported ? getAnalytics(app) : null))
      .catch(() => null);
  }
  return analyticsPromise;
}
