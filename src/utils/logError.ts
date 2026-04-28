import { logEvent } from "firebase/analytics";
import { getAnalyticsLazy } from "../firebase";

// TODO: wire to telemetry (Sentry/Rollbar) when a client is added
export function logError(err: unknown, context?: Record<string, unknown>): void {
  console.error(err, context);

  if (import.meta.env.PROD) {
    const message = err instanceof Error ? err.message : String(err);
    void getAnalyticsLazy().then((analytics) => {
      if (analytics === null) return;
      try {
        logEvent(analytics, "app_error", {
          message,
          context: JSON.stringify(context ?? {}),
        });
      } catch {
        // Already console.error'd above; swallow analytics failures so they
        // can't break the calling code path.
      }
    });
  }
}
