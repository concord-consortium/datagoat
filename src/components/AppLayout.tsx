import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { HamburgerMenu } from "./HamburgerMenu";
import { OfflineBanner } from "./OfflineBanner";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/profile": "Profile",
  "/setup/daily": "Daily Data Setup",
  "/setup/outcomes": "Outcomes Setup",
  "/track/body": "My Body",
  "/track/outcomes": "My Sport",
  "/admin": "Admin",
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith("/track/body/")) return "Metric Detail";
  return "DataGOAT";
}

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const pageTitle = getPageTitle(pathname);

  return (
    <div className="drawer">
      <input
        id="nav-drawer"
        type="checkbox"
        className="drawer-toggle"
        checked={drawerOpen}
        onChange={(e) => setDrawerOpen(e.target.checked)}
      />

      <div className="drawer-content flex flex-col min-h-screen">
        <OfflineBanner />
        {/* Header */}
        <header className="navbar bg-secondary text-secondary-content shadow-md sticky top-0 z-30">
          <div className="flex-none">
            <label
              htmlFor="nav-drawer"
              className="btn btn-ghost btn-square"
              aria-label="Open navigation menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </label>
          </div>
          <div className="flex-1">
            <span className="text-xl font-bold">{pageTitle}</span>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 max-w-4xl mx-auto w-full">
          <Outlet />
        </main>
      </div>

      {/* Drawer sidebar */}
      <div className="drawer-side z-40">
        <label
          htmlFor="nav-drawer"
          className="drawer-overlay"
          aria-label="Close navigation menu"
        />
        <HamburgerMenu onClose={() => setDrawerOpen(false)} />
      </div>
    </div>
  );
}
