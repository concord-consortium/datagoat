import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import {
  buildCodapWrappedUrl,
  shouldRedirectToCodap,
} from "./codap/codapUrl";
import "./index.css";
import App from "./App";

const isCodapRoute = window.location.pathname === "/codap";

// Iframe-aware redirect for /codap. A top-level visit to /codap
// (bookmark, shared link, refresh) bounces to the CODAP-wrapped URL
// so the plugin always loads inside CODAP. Runs BEFORE createRoot so a
// top-level visit doesn't pay the SPA bundle / lazy-chunk cost just to
// redirect away from itself. The dev escape hatch (?noredirect=1) is
// honored by shouldRedirectToCodap.
if (isCodapRoute && shouldRedirectToCodap()) {
  window.location.replace(
    buildCodapWrappedUrl(
      new URLSearchParams(window.location.search).get("demo") !== null,
    ),
  );
} else {
  // Path-based SW skip for /codap. Per spec: the CODAP plugin route is
  // loaded inside CODAP's iframe; the SW would caching-conflict with
  // the parent origin's expectations and offline support inside an
  // iframe is meaningless. The check is path-based, not iframe-based -
  // we own the URL we hand CODAP (?di=...datagoat.../codap), so route
  // gating is the right primitive (per the prototype-vs-spec audit
  // RESOLVED).
  //
  // IMPORTANT: this guard runs BEFORE registerSW() so a previous SW
  // install isn't re-activated for this tab. We also skip the cache
  // warming + visibilitychange / controllerchange handlers since those
  // are SW-dependent.
  if (!isCodapRoute) {
    registerSW({ immediate: true });

    navigator.serviceWorker?.ready.then(async (reg) => {
      const cache = await caches.open("pages");
      if (!(await cache.match(window.location.href))) {
        await cache.add(window.location.href);
      }

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          reg.update();
        }
      });
    });

    const hadController = !!navigator.serviceWorker?.controller;
    navigator.serviceWorker?.addEventListener("controllerchange", () => {
      if (hadController) {
        window.location.reload();
      }
    });
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
