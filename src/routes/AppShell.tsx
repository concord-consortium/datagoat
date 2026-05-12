import { useEffect, useRef, type MouseEvent } from "react";
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
import { resolveRouteMeta } from "./routeMeta";
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

// Skip-link target excludes section-heading chrome buttons (per spec,
// prototype HTML around line 5453). Skip-link target is <main>, but if
// SectionHeading buttons sit at the top of <main>, focus may walk into
// them on the next Tab; the load-bearing behavior is to advance past
// them to the first content focusable.
//
// Match on `data-skip-link-exclude` rather than CSS Module class names -
// CSS Modules hash the class names ("_navMenuBtn_a5cf63"), so the raw
// kebab-case selectors that worked in the prototype's vanilla JS would
// never match here. The data attribute is stable across modules.
const SKIP_LINK_EXCLUDED_ATTR = "data-skip-link-exclude";

// Single selector for the skip-link focus advance: filters out
// excluded chrome buttons inline, and skips disabled form controls
// (calling .focus() on a disabled element silently no-ops, which would
// strand focus on the skip link).
const SKIP_LINK_TARGET_SELECTOR = [
  `a[href]:not([${SKIP_LINK_EXCLUDED_ATTR}])`,
  `button:not([${SKIP_LINK_EXCLUDED_ATTR}]):not([disabled])`,
  `input:not([${SKIP_LINK_EXCLUDED_ATTR}]):not([disabled])`,
  `select:not([${SKIP_LINK_EXCLUDED_ATTR}]):not([disabled])`,
  `textarea:not([${SKIP_LINK_EXCLUDED_ATTR}]):not([disabled])`,
  `[tabindex]:not([tabindex="-1"]):not([${SKIP_LINK_EXCLUDED_ATTR}])`,
].join(", ");

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
  const { pathname, state: locationState } = useLocation();
  const isAuthRoute = AUTH_PATHS.has(pathname);
  const showHeader = !isAuthRoute;
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
  const routeMeta = resolveRouteMeta(
    pathname,
    customs,
    locationState as { backTo?: string } | null,
  );
  const mainRef = useRef<HTMLElement | null>(null);

  // WCAG 2.4.2 (Page Titled): keep document.title in sync with the active
  // route so SR users and tab-switching users get orientation cues across
  // SPA navigations. Auth routes have no routeMeta, so fall back to
  // AUTH_TITLES; routes with neither (404-ish) get the bare brand.
  const docTitle = routeMeta?.title ?? AUTH_TITLES[pathname];
  useEffect(() => {
    document.title = docTitle ? `${docTitle} | DataGOAT` : "DataGOAT";
  }, [docTitle]);

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
  }, []);

  function handleSkipLinkClick(e: MouseEvent<HTMLAnchorElement>) {
    // Suppress the browser's anchor jump so #main-content doesn't end up
    // in the URL, then advance focus to the first content focusable -
    // skipping SectionHeading chrome buttons (.nav-menu-btn /
    // .nav-home-btn / .back-nav-btn) which carry SKIP_LINK_EXCLUDED_ATTR.
    e.preventDefault();
    const main = mainRef.current;
    if (!main) return;
    const first = main.querySelector<HTMLElement>(SKIP_LINK_TARGET_SELECTOR);
    (first ?? main).focus();
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
      {showHeader && (
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
      )}
      {/* tabIndex={0} keeps DGT-6's keyboard-scroll affordance: keyboard
          users can Tab onto <main> and use arrow / PgUp / PgDn / Home /
          End to scroll. tabIndex={0} is also programmatically focusable
          (.focus()), so the skip-link's focus advance still works.
          tabIndex={-1} would break the scroll affordance. */}
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={0}
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
        <Outlet
          context={{
            menuOpen,
            toggleMenu: () => setMenuOpen(!menuOpen),
          }}
        />
        {/* Mounted inside <main> so the Dialog's absolute-positioned
            backdrop scopes to the content area below the AppHeader,
            matching the prototype's "menu drops below the section
            heading; header stays visible" pattern. */}
        <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      </main>
    </div>
  );
}
