import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppHeader } from "../components/layout/AppHeader";
import { HamburgerMenu } from "../components/layout/HamburgerMenu";
import { VerificationBanner } from "../components/auth/VerificationBanner";
import common from "../components/common.module.css";
import css from "./AppShell.module.css";

// Routes that opt out of the AppHeader. Per spec the dashboard owns its
// own header-slide carousel and replaces AppHeader; this set is the
// dashboard-step's eventual exclusion target. While the dashboard is still
// a <ScreenStub /> in this foundation session, leave the set empty so the
// hamburger trigger is reachable from /dashboard. The dashboard step adds
// '/dashboard' here when the carousel lands.
const HIDE_HEADER_PATHS = new Set<string>();

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

// Selectors of section-heading chrome buttons that the skip link must not
// land on (per spec, prototype HTML around line 5453). Skip-link target is
// <main tabIndex={-1}>, but if SectionHeading buttons sit at the top of
// <main>, focus may walk into them on the next Tab; keeping them out of
// the skip-target focus advance is the load-bearing behavior.
const SKIP_LINK_EXCLUDED = ".nav-menu-btn, .nav-home-btn, .back-nav-btn";

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const showHeader =
    !HIDE_HEADER_PATHS.has(pathname) && !AUTH_PATHS.has(pathname);
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

    function onFocusIn(e: FocusEvent) {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!main!.contains(target)) return;
      // Ignore the main element itself.
      if (target === main) return;
      target.scrollIntoView({ block: "nearest" });
      const offset = findStickyOffset(target);
      if (offset <= 0) return;
      const rect = target.getBoundingClientRect();
      const mainRect = main!.getBoundingClientRect();
      const overlap = offset - (rect.top - mainRect.top);
      if (overlap > 0) {
        main!.scrollBy({ top: -overlap, behavior: "auto" });
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
        if (node.matches(SKIP_LINK_EXCLUDED)) continue;
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
        <header>
          <AppHeader
            menuOpen={menuOpen}
            onToggleMenu={() => setMenuOpen((o) => !o)}
          />
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
            toggleMenu: () => setMenuOpen((o) => !o),
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
