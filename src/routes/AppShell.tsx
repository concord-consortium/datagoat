import { useEffect, useLayoutEffect, useRef, type MouseEvent } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppHeader } from "../components/layout/AppHeader";
import { DashboardHeaderSlide } from "../components/dashboard/DashboardHeaderSlide";
import { SectionHeading } from "../components/layout/SectionHeading";
import { HamburgerMenu } from "../components/layout/HamburgerMenu";
import { VerificationBanner } from "../components/auth/VerificationBanner";
import { useAuth } from "../contexts/AuthContext";
import { useCustomMetrics } from "../contexts/CustomMetricsContext";
import { NavMenuProvider, useNavMenu } from "../contexts/NavMenuContext";
import { OverlayProvider } from "../contexts/OverlayContext";
import { resolveRouteMeta, type RouteLocationState } from "./routeMeta";
import { focusFirstContentControl } from "../components/common/skipLink";
import common from "../components/common.module.css";
import css from "./AppShell.module.css";

// Auth-time routes don't render the hamburger trigger - they get plain auth
// chrome instead. AppShell still hosts the menu state so any rendered
// trigger can open it; routes that mount their own SectionHeading will
// receive the open handler via context in a later step. For now: AppHeader
// renders on authed routes, and the hamburger menu opens from there.
const AUTH_PATHS = new Set<string>([
  "/login",
  "/signup",
  "/forgot-password",
  "/verify-email",
]);

// Auth routes have no routeMeta (SectionHeading is suppressed), but they
// still need distinct document.title values so SR users and tab-switching
// users get orientation cues across the auth flow.
const AUTH_TITLES: Record<string, string> = {
  "/login": "Sign In",
  "/signup": "Sign Up",
  "/forgot-password": "Reset Password",
  "/verify-email": "Verify Email",
};

// React Router v7 route-matches trailing-slash URLs (/login/) to their
// slash-less routes, but useLocation().pathname preserves the trailing
// slash. Strip it (except root "/") so the exact-match AUTH_PATHS /
// AUTH_TITLES lookups - and the isDashboard / routeMeta checks - stay
// slash-insensitive. Without this, a hand-typed or bookmarked /login/
// misses AUTH_PATHS, AppShell re-emits its own <main id="main-content">
// on top of AuthLayout's, and the duplicate landmark DGT-47 removed
// returns (plus the title falls back to the bare brand). Collapses
// repeated trailing slashes too.
function normalizePathname(pathname: string): string {
  const stripped = pathname.replace(/\/+$/, "");
  return stripped === "" ? "/" : stripped;
}

export function AppShell() {
  // NavMenuProvider hosts the open/close state so non-menu components
  // (DashboardHeaderSlide) can pause the carousel while the menu is open.
  // Inner shell consumes the context for the AppHeader trigger + Dialog.
  return (
    <OverlayProvider>
      <NavMenuProvider>
        <AppShellInner />
      </NavMenuProvider>
    </OverlayProvider>
  );
}

function AppShellInner() {
  const { isOpen: menuOpen, setIsOpen: setMenuOpen } = useNavMenu();
  const { user } = useAuth();
  const { pathname: rawPathname, state: locationState } = useLocation();
  // Shadow pathname with its normalized form so every pathname-keyed
  // check below (isAuthRoute, isDashboard, AUTH_TITLES, resolveRouteMeta,
  // the scroll-reset effect) is slash-insensitive in one place.
  const pathname = normalizePathname(rawPathname);
  const isAuthRoute = AUTH_PATHS.has(pathname);
  // /dashboard renders DashboardHeaderSlide (the wordmark<->motivation
  // carousel) instead of the static AppHeader. Both render inside the
  // AppShell's <header> element - OUTSIDE <main> - so the brand chrome
  // stays pinned at the top of the column while only the screen content
  // scrolls. (Matches the prototype: `.screen-header` lives outside
  // `.screen-body`, the latter being the scroll container.)
  const isDashboard = pathname === "/dashboard";
  // Custom-metric titles live in CustomMetricsContext rather than the
  // static metric registries; thread the array into resolveRouteMeta so
  // /health/:metricId and /competition/:metricId can resolve a custom
  // metric's name + back-target.
  const { metrics: customs } = useCustomMetrics();
  // useLocation().state is typed `unknown`; narrow it at the boundary
  // to the exported RouteLocationState shape (or null). Callers that
  // navigate with state via Link / navigate(...) pass an object
  // matching RouteLocationState; anything else flows through as null
  // so the resolver falls back to the registry defaults.
  const safeLocationState: RouteLocationState | null =
    locationState && typeof locationState === "object"
      ? (locationState as RouteLocationState)
      : null;
  const routeMeta = resolveRouteMeta(pathname, customs, safeLocationState);
  const mainRef = useRef<HTMLElement | null>(null);

  // WCAG 2.4.2 (Page Titled): keep document.title in sync with the active
  // route so SR users and tab-switching users get orientation cues across
  // SPA navigations. Auth routes have no routeMeta, so fall back to
  // AUTH_TITLES; routes with neither (404-ish) get the bare brand.
  const docTitle = routeMeta?.title ?? AUTH_TITLES[pathname];
  useEffect(() => {
    document.title = docTitle ? `${docTitle} | DataGOAT` : "DataGOAT";
  }, [docTitle]);

  // Reset the scroll container to the top on route change. <main> is
  // the only scroll container (the column header sits outside <main>
  // and stays pinned), so without this a navigation from the bottom
  // of one page lands the next page already scrolled to the bottom -
  // most visible in the "Go To Dashboard" handoff at the bottom of
  // /setup/tracking, where the Dashboard's chart cards were rendering
  // off-screen on first paint.
  //
  // useLayoutEffect (not useEffect) so the scrollTop write happens
  // before the browser paints the new route. With useEffect, the
  // new page would briefly render at the previous scroll position
  // and then jump to the top, which is the visible flicker the PR
  // is supposed to eliminate.
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (main) main.scrollTop = 0;
  }, [pathname]);

  // Document focusin auto-scroll behavior (port of prototype HTML around
  // line 5460). Compute the element's position relative to <main> and the
  // current sticky-chrome offset (DateNav, ~50px when pinned) up front,
  // then scroll only when the focused element is below the viewport or
  // overlaps sticky chrome. Elements already fully visible trigger no
  // scroll, avoiding unsolicited jumps for screen-magnifier and keyboard
  // users (WCAG 2.4.7/2.4.11).
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    function findStickyOffset(el: Element): number {
      let total = 0;
      let cursor: Element | null = el.parentElement;
      while (cursor && cursor !== main) {
        const cs = window.getComputedStyle(cursor);
        if (cs.position === "sticky") {
          total += cursor.getBoundingClientRect().height;
        }
        cursor = cursor.parentElement;
      }
      // Add any sticky siblings preceding the focused element. CSS
      // Modules ship classes hashed (e.g. "_dateNav_a5cf63"), so we tag
      // sticky-chrome wrappers with `data-sticky-chrome` and match on
      // that stable attribute - mirrors the data-skip-link-exclude
      // pattern documented above.
      main!.querySelectorAll("[data-sticky-chrome]").forEach((node) => {
        const cs = window.getComputedStyle(node);
        if (cs.position === "sticky" && !node.contains(el)) {
          const r = node.getBoundingClientRect();
          const mainTop = main!.getBoundingClientRect().top;
          // A sticky is "pinned" when its top sits at its CSS `top` offset
          // relative to the scroll container. Comparing to mainTop alone
          // would miss stickies pinned beneath an earlier sticky band.
          const cssTop = parseFloat(cs.top || "0") || 0;
          if (Math.abs(r.top - mainTop - cssTop) < 2) {
            total += r.height;
          }
        }
      });
      return total;
    }

    // Honor prefers-reduced-motion: bringing an off-screen focused element
    // into view is essential motion (per requirements "Reduced motion":
    // focus indicators are essential), so the offscreen-below and
    // offscreen-above cases run regardless. Sticky-chrome overlap
    // compensation is decorative and is skipped under reduced motion.
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    function onFocusIn(e: FocusEvent) {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      // Skip focus events that originate inside a modal dialog. Dialogs
      // (HamburgerMenu, MobileCodapModal) mount inside <main> by design,
      // so the main.contains check below would otherwise let focus moves
      // inside the dialog scroll <main> behind it.
      if (target.closest('[role="dialog"]')) return;
      if (!main!.contains(target)) return;
      // Ignore the main element itself.
      if (target === main) return;

      const rect = target.getBoundingClientRect();
      const mainRect = main!.getBoundingClientRect();
      const offset = findStickyOffset(target);
      const topRelMain = rect.top - mainRect.top;

      // Below the viewport: scroll down so the element's bottom is just
      // inside the main's bottom edge.
      if (rect.bottom > mainRect.bottom) {
        main!.scrollBy({
          top: rect.bottom - mainRect.bottom,
          behavior: "instant",
        });
        return;
      }

      // Above the effective top of main (either offscreen-above, or
      // visible but tucked under sticky chrome). Scroll up so the element
      // top sits just below the sticky offset. The pure sticky-overlap
      // case (element technically in main's box, only obscured by sticky
      // chrome) is decorative and is skipped under reduced motion.
      if (topRelMain < offset) {
        const aboveViewport = topRelMain < 0;
        if (!aboveViewport && reducedMotion.matches) return;
        main!.scrollBy({
          top: topRelMain - offset,
          behavior: "instant",
        });
        return;
      }

      // Otherwise: element is fully visible below sticky chrome - no scroll.
    }

    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
    // Re-run on isAuthRoute change: auth routes render no <main>, so a
    // session that first loads on an auth route mounts this effect with a
    // null mainRef and bails. Re-running when the route leaves the auth
    // section attaches the listener once <main> exists.
  }, [isAuthRoute]);

  function handleSkipLinkClick(e: MouseEvent<HTMLAnchorElement>) {
    // Suppress the browser's anchor jump so #main-content doesn't end up
    // in the URL, then advance focus to the first content focusable -
    // skipping SectionHeading chrome buttons (.nav-menu-btn /
    // .nav-home-btn / .back-nav-btn) which carry data-skip-link-exclude.
    e.preventDefault();
    focusFirstContentControl(mainRef.current);
  }

  const outlet = (
    <Outlet
      context={{
        menuOpen,
        toggleMenu: () => setMenuOpen(!menuOpen),
      }}
    />
  );

  // Auth routes nest AuthLayout, which supplies the single
  // <main id="main-content"> + its own skip link. AppShell renders only a
  // plain scroll wrapper here (same .main box, so layout is unchanged) -
  // emitting a second <main>/skip-link would duplicate id="main-content",
  // and the auth skip link's anchor jump would then resolve to AppShell's
  // outer <main> and ring the whole page (DGT-47). VerificationBanner and
  // HamburgerMenu render nothing on auth routes, so they're omitted too.
  if (isAuthRoute) {
    return (
      <div className={css.shell}>
        <div className={css.main}>{outlet}</div>
      </div>
    );
  }

  return (
    <div className={css.shell}>
      <a
        className={common.skipLink}
        href="#main-content"
        onClick={handleSkipLinkClick}
      >
        Skip to main content
      </a>
      {/* Auth routes return early above, so the header always renders here. */}
      <header className={css.header}>
        {isDashboard ? <DashboardHeaderSlide /> : <AppHeader />}
        {routeMeta && (
          <SectionHeading
            title={routeMeta.title}
            icon={routeMeta.icon}
            showHome={routeMeta.showHome}
            backTo={routeMeta.backTo}
          />
        )}
      </header>
      {/* tabIndex: <main> is always programmatically focusable (so the
          skip-link's .focus() advance and the empty-page fallback still
          work). Whether it's ALSO a sequential tab stop depends on the
          route:

          - Default (tabIndex={-1}): NOT a tab stop. Per DGT-47, tabbing
            onto the whole scrollable container was flagged as noise - a
            focus ring around the entire page on every Tab - so it's removed
            from the tab order. This reverses DGT-6's "Tab onto <main> to
            arrow-scroll" affordance; keyboard users still scroll by focusing
            any control inside the page (focusin auto-scroll keeps them in
            view).

          - scrollFocusable routes (tabIndex={0}): pure-text screens (About,
            Info topics) have NO focusable control inside <main>, so the
            DGT-47 mitigation ("focus a control inside the page") doesn't
            apply. For those we restore DGT-6's affordance so keyboard-only
            users can Tab onto <main> and arrow-scroll. Flagged per-route via
            RouteMeta.scrollFocusable. */}
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={routeMeta?.scrollFocusable ? 0 : -1}
        className={css.main}
      >
        {/* VerificationBanner mounts as the first child of <main> per spec.
            It self-gates on useAuth() (renders nothing on auth routes
            where user is null, on verified accounts, on accounts younger
            than 7 days, or after the per-uid dismiss flag is set in
            localStorage), so no per-route opt-out is needed.

            key={user?.uid ?? "anon"} forces a remount on uid change so
            the banner's useState initializer re-reads localStorage for
            the new uid - otherwise an account switch within the same
            SPA session would inherit the previous uid's dismissal. */}
        <VerificationBanner key={user?.uid ?? "anon"} />
        {outlet}
        {/* Mounted inside <main> so the Dialog's absolute-positioned
            backdrop scopes to the content area below the AppHeader,
            matching the prototype's "menu drops below the section
            heading; header stays visible" pattern. */}
        <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      </main>
    </div>
  );
}
