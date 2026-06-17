// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

// AppShell pulls in DashboardHeaderSlide (carousel + matchMedia),
// VerificationBanner (Firebase), HamburgerMenu (Dialog), and AppHeader.
// Stub them so the test exercises only AppShell's own logic: doc-title
// sync, skip-link focus advance, and focusin auto-scroll.
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock("../components/dashboard/DashboardHeaderSlide", () => ({
  DashboardHeaderSlide: () => <div data-testid="dashboard-header-slide" />,
}));

vi.mock("../components/auth/VerificationBanner", () => ({
  VerificationBanner: () => null,
}));

vi.mock("../components/layout/HamburgerMenu", () => ({
  HamburgerMenu: () => null,
}));

vi.mock("../components/layout/AppHeader", () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));

import { AppShell } from "./AppShell";

function renderShell(initialEntry: string, content: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/health" element={content} />
          <Route path="/test" element={content} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function renderAuthShell(initialEntry: string, content: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/login" element={content} />
          <Route path="/verify-email" element={content} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function fakeRect(partial: Partial<DOMRect>): DOMRect {
  const base = {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
  return { ...base, ...partial } as DOMRect;
}

describe("AppShell", () => {
  describe("document.title sync (WCAG 2.4.2)", () => {
    it("sets document.title to 'Health Log | DataGOAT' on /health", () => {
      renderShell("/health", <div>health content</div>);
      expect(document.title).toBe("Health Log | DataGOAT");
    });
  });

  describe("skip-link focus advance (WCAG 2.4.1)", () => {
    it("advances focus past data-skip-link-exclude elements to the first content focusable", async () => {
      const user = userEvent.setup();
      renderShell(
        "/test",
        <>
          <button type="button" data-skip-link-exclude>
            Excluded chrome button
          </button>
          <button type="button">First content focusable</button>
        </>,
      );
      await user.click(
        screen.getByRole("link", { name: /skip to main content/i }),
      );
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "First content focusable" }),
      );
    });
  });

  describe("auth routes (AuthLayout owns the landmark)", () => {
    it("does not render AppShell's own <main>/skip-link on /login", () => {
      // DGT-47: auth routes nest AuthLayout, which supplies the single
      // <main id="main-content"> + skip link. AppShell must not emit a
      // second one - duplicate id="main-content" made the auth skip link's
      // anchor jump ring the whole page. The stubbed route content here has
      // no main-content, so any main-content present would be AppShell's.
      renderAuthShell("/login", <div data-testid="auth-content">login</div>);
      expect(document.getElementById("main-content")).toBeNull();
      expect(
        screen.queryByRole("link", { name: /skip to main content/i }),
      ).toBeNull();
      expect(screen.getByTestId("auth-content")).toBeInTheDocument();
    });

    it("still syncs document.title via AUTH_TITLES on /login", () => {
      renderAuthShell("/login", <div>login</div>);
      expect(document.title).toBe("Sign In | DataGOAT");
    });
  });

  describe("focusin auto-scroll", () => {
    it("calls main.scrollBy with positive top when the focused element sits below main's rect", () => {
      renderShell("/test", <button type="button">Far below</button>);

      const main = document.getElementById("main-content")!;
      const target = screen.getByRole("button", { name: "Far below" });

      // jsdom doesn't lay things out, so fake the rects: main covers
      // 0..500, target sits at 600..650 - below main's bottom edge by 150.
      vi.spyOn(main, "getBoundingClientRect").mockReturnValue(
        fakeRect({ top: 0, bottom: 500, height: 500, width: 320, right: 320 }),
      );
      vi.spyOn(target, "getBoundingClientRect").mockReturnValue(
        fakeRect({ top: 600, bottom: 650, height: 50, width: 100, right: 100, y: 600 }),
      );

      const scrollBy = vi.fn();
      main.scrollBy = scrollBy as unknown as Element["scrollBy"];

      fireEvent.focusIn(target);

      expect(scrollBy).toHaveBeenCalledTimes(1);
      const arg = scrollBy.mock.calls[0][0] as ScrollToOptions;
      expect(arg.top).toBeGreaterThan(0);
    });

    it("does NOT scroll when the focused element sits inside a [role=dialog]", () => {
      renderShell(
        "/test",
        <div role="dialog" aria-modal="true" aria-label="d">
          <button type="button">Inside dialog</button>
        </div>,
      );

      const main = document.getElementById("main-content")!;
      const target = screen.getByRole("button", { name: "Inside dialog" });

      vi.spyOn(main, "getBoundingClientRect").mockReturnValue(
        fakeRect({ top: 0, bottom: 500, height: 500, width: 320, right: 320 }),
      );
      vi.spyOn(target, "getBoundingClientRect").mockReturnValue(
        fakeRect({ top: 600, bottom: 650, height: 50, width: 100, right: 100, y: 600 }),
      );

      const scrollBy = vi.fn();
      main.scrollBy = scrollBy as unknown as Element["scrollBy"];

      fireEvent.focusIn(target);

      expect(scrollBy).not.toHaveBeenCalled();
    });
  });

  describe("scroll position reset on route change", () => {
    it("resets <main>.scrollTop to 0 when navigating between routes", async () => {
      // Regression guard for DGT-57. <main> is the only scroll
      // container in AppShell; React Router does not reset nested
      // container scroll on navigation, so without the
      // useLayoutEffect added in this PR, the new page would land
      // wherever the old page was scrolled (visible after
      // /setup/tracking → /dashboard for the "Go To Dashboard"
      // handoff at the bottom of the page).
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/test"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route
                path="/test"
                element={
                  <Link to="/health" data-testid="go-health">
                    To Health
                  </Link>
                }
              />
              <Route path="/health" element={<div>health content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );

      const main = document.getElementById("main-content")!;
      // Simulate the user having scrolled down before navigating.
      main.scrollTop = 1200;
      expect(main.scrollTop).toBe(1200);

      await user.click(screen.getByTestId("go-health"));

      // After the route change, the useLayoutEffect resets the
      // scroll container before paint.
      expect(main.scrollTop).toBe(0);
    });
  });
});
