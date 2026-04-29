import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppHeader } from "../components/layout/AppHeader";
import { DashboardHeaderSlide } from "../components/dashboard/DashboardHeaderSlide";
import { SectionHeading } from "../components/layout/SectionHeading";
import { HamburgerMenu } from "../components/layout/HamburgerMenu";
import { VerificationBanner } from "../components/auth/VerificationBanner";
import { NavMenuProvider, useNavMenu } from "../contexts/NavMenuContext";
import { resolveRouteMeta } from "./routeMeta";
import common from "../components/common.module.css";
import css from "./AppShell.module.css";

// /dashboard renders DashboardHeaderSlide (the wordmark<->motivation
// carousel) instead of the static AppHeader. Both render inside the
// AppShell's <header> element - OUTSIDE <main> - so the brand chrome
// stays pinned at the top of the column while only the screen content
// scrolls. (Matches the prototype: `.screen-header` lives outside
// `.screen-body`, the latter being the scroll container.)
const DASHBOARD_PATHS = new Set<string>(["/dashboard"]);

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

export function AppShell() {
  // NavMenuProvider hosts the open/close state so non-menu components
  // (DashboardHeaderSlide) can pause the carousel while the menu is open.
  // Inner shell consumes the context for the AppHeader trigger + Dialog.
  return (
    <NavMenuProvider>
      <AppShellInner />
    </NavMenuProvider>
  );
}

function AppShellInner() {
  const { isOpen: menuOpen, setIsOpen: setMenuOpen } = useNavMenu();
  const { pathname } = useLocation();
  const isAuthRoute = AUTH_PATHS.has(pathname);
  const showHeader = !isAuthRoute;
  const isDashboard = DASHBOARD_PATHS.has(pathname);
  const routeMeta = resolveRouteMeta(pathname);
  const mainRef = useRef<HTMLElement | null>(null);

  // Document focusin auto-scroll-into-view (port of prototype HTML around
  // line 5460). When a focused element ends up under sticky chrome
  // (.section-heading + .date-nav stack to ~140px on dense screens),
  // scrollIntoView with block:nearest puts the element at the *boundary*,
  // which still leaves it under the sticky overlay. The corrective
  // scrollBy below offsets by the cumulative sticky-chrome height so the
  // focused element sits visibly below.
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
      // Add any sticky siblings preceding the focused element so
      // .section-heading + .date-nav stacks are accounted for.
      const stickyChromeSelectors = [".section-heading", ".date-nav"];
      stickyChromeSelectors.forEach((sel) => {
        main!.querySelectorAll(sel).forEach((node) => {
          const cs = window.getComputedStyle(node);
          if (cs.position === "sticky" && !node.contains(el)) {
            const r = node.getBoundingClientRect();
            const mainTop = main!.getBoundingClientRect().top;
            // Counts only when the sticky node is currently pinned at top.
            if (Math.abs(r.top - mainTop) < 2) {
              total = Math.max(total, r.bottom - mainTop);
            }
          }
        });
      });
      return total;
    }

    // Honor prefers-reduced-motion: skip the corrective scrollBy when
    // the user requested reduced motion. The base scrollIntoView call
    // remains because keeping a focused element visible is essential
    // motion (per requirements "Reduced motion": focus indicators are
    // essential and not zeroed under the media query); the corrective
    // sticky-offset compensation is decorative.
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    function onFocusIn(e: FocusEvent) {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!main!.contains(target)) return;
      // Ignore the main element itself.
      if (target === main) return;
      target.scrollIntoView({ block: "nearest" });
      if (reducedMotion.matches) return;
      const offset = findStickyOffset(target);
      if (offset <= 0) return;
      const rect = target.getBoundingClientRect();
      const mainRect = main!.getBoundingClientRect();
      const overlap = offset - (rect.top - mainRect.top);
      if (overlap > 0) {
        main!.scrollBy({ top: -overlap, behavior: "instant" });
      }
    }

    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  function handleSkipLinkClick() {
    // The href="#main-content" anchor jump moves the URL fragment, but
    // <main tabIndex={-1}> only takes focus programmatically. Schedule the
    // focus advance after the browser has handled the jump so the user
    // ends up at the first content focusable, NOT on a SectionHeading
    // chrome button (.nav-menu-btn / .nav-home-btn / .back-nav-btn).
    const main = mainRef.current;
    if (!main) return;
    requestAnimationFrame(() => {
      const focusables = main.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      for (const node of focusables) {
        if (node.hasAttribute(SKIP_LINK_EXCLUDED_ATTR)) continue;
        node.focus();
        return;
      }
      // Fallback: focus the main element itself.
      main.focus();
    });
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
            localStorage), so no per-route opt-out is needed. */}
        <VerificationBanner />
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
