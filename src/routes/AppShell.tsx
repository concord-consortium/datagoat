import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AppHeader } from "../components/layout/AppHeader";
import { HamburgerMenu } from "../components/layout/HamburgerMenu";
import common from "../components/common.module.css";
import css from "./AppShell.module.css";

// Routes that opt out of the AppHeader (currently just the dashboard, which
// has its own header-slide carousel landed in a later step).
const HIDE_HEADER_PATHS = new Set<string>(["/dashboard"]);

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

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const showHeader =
    !HIDE_HEADER_PATHS.has(pathname) && !AUTH_PATHS.has(pathname);

  return (
    <div className={css.shell}>
      <a className={common.skipLink} href="#main-content">
        Skip to main content
      </a>
      {showHeader && (
        <header>
          <AppHeader onOpenMenu={() => setMenuOpen(true)} />
        </header>
      )}
      <main id="main-content" tabIndex={0} className={css.main}>
        <Outlet context={{ openMenu: () => setMenuOpen(true) }} />
      </main>
      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
