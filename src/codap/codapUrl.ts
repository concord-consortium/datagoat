// Shared helpers for the /codap route's URL handling. Two callers:
//
// 1. main.tsx redirects a top-level visit to /codap into the CODAP-
//    wrapped URL so a bookmarked or directly-loaded /codap link still
//    ends up inside CODAP. The redirect runs before React mounts.
// 2. CodapButton (Dashboard) opens the wrapped URL directly in a new
//    tab - the "fast path" - so a click goes straight to CODAP without
//    a datagoat.concord.org bundle-load + redirect hop in between.
//
// Both share buildCodapWrappedUrl so the localhost/prod resolution
// lives in one place.

const CODAP_ORIGIN = "https://codap3.concord.org";

// Resolves the di= origin to the current window's origin. This already
// covers localhost (with port), prod, and Firebase Hosting preview
// channels (e.g. datagoat-staging--pr-3-abc.web.app), so CODAP
// iframes the *current* /codap rather than always pointing at prod.
// The SSR guard returns the prod origin as a defensive default; we
// don't ship SSR.
function diOrigin(): string {
  if (typeof window === "undefined") return "https://datagoat.concord.org";
  return window.location.origin;
}

// The `demo` flag is threaded onto the di= plugin path (`/codap?demo`) so
// DemoModeProvider inside the CODAP iframe puts the export panel into demo
// mode. Callers pass demo from the right source: CodapButton from
// useDemoMode() (the session demo state survives the app's ?demo-stripping
// redirects, whereas window.location.search does not), and main.tsx from
// the top-level /codap?demo URL (which still carries the param pre-React).
//
// This relies on CODAP preserving the di= value's query string verbatim
// when it loads the plugin iframe (confirmed by a manual runtime test, not
// unit tests). If CODAP ever starts stripping it, URL-encode the di value.
export function buildCodapWrappedUrl(demo: boolean): string {
  return `${CODAP_ORIGIN}?di=${diOrigin()}/codap${demo ? "?demo" : ""}`;
}

// True iff the current /codap load is top-level (not inside any iframe)
// AND ?noredirect=1 was not passed. The query-param escape hatch lets
// devs load /codap top-level for debugging the panel without spinning
// up CODAP.
//
// Detection uses window.parent identity rather than window.top to avoid
// rare cross-origin SecurityErrors on `top` access. The parent identity
// comparison is itself spec-safe, but sandboxed / privacy-partitioned
// iframes can still throw on parent access in practice; a throw here
// would blank the page since main.tsx never reaches createRoot, so we
// catch and treat access denial as "framed" (no redirect). False-mode
// analysis:
//   - false positive (top-level looks framed): no redirect, plugin
//     renders top-level (= existing behavior pre-redirect). The
//     SecurityError catch lands in this branch.
//   - false negative (framed looks top-level): one redirect cycle, then
//     we're framed and detection is correct - no loop.
export function shouldRedirectToCodap(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.self !== window.parent) return false;
  } catch {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("noredirect") === "1") return false;
  return true;
}
