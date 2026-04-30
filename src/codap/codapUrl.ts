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

// Resolves the di= origin: localhost dev wants the dev server's port so
// CODAP iframes the *local* /codap; deployed builds want the prod
// origin. window.location.origin already encodes the port, so we just
// branch on hostname.
function diOrigin(): string {
  if (typeof window === "undefined") return "https://datagoat.concord.org";
  if (window.location.hostname === "localhost") return window.location.origin;
  return "https://datagoat.concord.org";
}

export function buildCodapWrappedUrl(): string {
  return `${CODAP_ORIGIN}?di=${diOrigin()}/codap`;
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
