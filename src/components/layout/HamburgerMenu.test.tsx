// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

import type { ProfileLoadState, UserProfile } from "../../types/profile";

const ctx = vi.hoisted(() => ({
  loadState: { status: "loading" } as ProfileLoadState,
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ loadState: ctx.loadState }),
}));

import { HamburgerMenu } from "./HamburgerMenu";
import css from "./HamburgerMenu.module.css";

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    version: 1,
    fullName: "T",
    email: "t@e.com",
    nickname: "",
    age: 18,
    heightFt: 5,
    heightIn: 9,
    weight: 150,
    gender: "unspecified",
    athleteType: "endurance",
    competitionTerm: "game",
    trackedHealthMetrics: [],
    trackedCompetitionMetrics: [],
    profileComplete: true,
    trackingSetupComplete: true,
    ...overrides,
  };
}

function renderMenu() {
  render(
    <MemoryRouter>
      <HamburgerMenu open onClose={() => {}} />
    </MemoryRouter>,
  );
}

// Locate the dashboard <li> wrapper (gated when isOnboarding=true). Profile
// stays unlocked so a partway-onboarded user can finish their profile.
function dashboardLi(): HTMLElement {
  return screen.getByRole("link", { name: /dashboard/i }).closest("li")!;
}

function dashboardLink(): HTMLElement {
  return screen.getByRole("link", { name: /dashboard/i });
}

describe("HamburgerMenu narrowed isOnboarding derivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loadState 'loading' -> NOT gated (default-false during the cold-start window)", () => {
    ctx.loadState = { status: "loading" };
    renderMenu();
    expect(dashboardLink()).not.toHaveAttribute("aria-disabled");
    expect(dashboardLi()).not.toHaveClass(css.menuItemDisabled);
  });

  it("loadState 'missing' -> gated", () => {
    ctx.loadState = { status: "missing" };
    renderMenu();
    expect(dashboardLink()).toHaveAttribute("aria-disabled", "true");
    expect(dashboardLi()).toHaveClass(css.menuItemDisabled);
  });

  it("loadState 'loaded' with both flags true -> NOT gated", () => {
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({
        profileComplete: true,
        trackingSetupComplete: true,
      }),
    };
    renderMenu();
    expect(dashboardLink()).not.toHaveAttribute("aria-disabled");
    expect(dashboardLi()).not.toHaveClass(css.menuItemDisabled);
  });

  it("loadState 'loaded' with profileComplete=false -> gated", () => {
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({
        profileComplete: false,
        trackingSetupComplete: true,
      }),
    };
    renderMenu();
    expect(dashboardLink()).toHaveAttribute("aria-disabled", "true");
    expect(dashboardLi()).toHaveClass(css.menuItemDisabled);
  });

  it("loadState 'loaded' with trackingSetupComplete=false -> gated", () => {
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({
        profileComplete: true,
        trackingSetupComplete: false,
      }),
    };
    renderMenu();
    expect(dashboardLink()).toHaveAttribute("aria-disabled", "true");
    expect(dashboardLi()).toHaveClass(css.menuItemDisabled);
  });

  it("Profile menu item is NEVER gated (so partway-onboarded users can finish)", () => {
    ctx.loadState = { status: "missing" };
    renderMenu();
    const profileLink = screen.getByRole("link", { name: /^profile$/i });
    expect(profileLink).not.toHaveAttribute("aria-disabled");
  });

  it("Tracked Data Setup is gated in pre-profile phase (status='missing')", () => {
    ctx.loadState = { status: "missing" };
    renderMenu();
    const link = screen.getByRole("link", { name: /tracked data setup/i });
    expect(link).toHaveAttribute("aria-disabled", "true");
  });

  it("Tracked Data Setup is gated when profileComplete=false", () => {
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({
        profileComplete: false,
        trackingSetupComplete: false,
      }),
    };
    renderMenu();
    const link = screen.getByRole("link", { name: /tracked data setup/i });
    expect(link).toHaveAttribute("aria-disabled", "true");
  });

  it("Tracked Data Setup is reachable when profileComplete=true even if trackingSetupComplete=false", () => {
    // Bug fix: a partway-onboarded user (profile saved, tracking not yet
    // set up) needs to be able to navigate to /setup/tracking from the
    // hamburger menu to finish onboarding.
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({
        profileComplete: true,
        trackingSetupComplete: false,
      }),
    };
    renderMenu();
    const link = screen.getByRole("link", { name: /tracked data setup/i });
    expect(link).not.toHaveAttribute("aria-disabled");
    // Other routes (Dashboard, Health, etc.) stay gated.
    const dashLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashLink).toHaveAttribute("aria-disabled", "true");
  });

  it("gate hint copy reflects the active onboarding step", () => {
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({
        profileComplete: true,
        trackingSetupComplete: false,
      }),
    };
    renderMenu();
    expect(
      screen.getByText(/complete your tracked data setup/i),
    ).toBeInTheDocument();
  });
});

function BackToProbe() {
  const loc = useLocation();
  const backTo = (loc.state as { backTo?: string } | null)?.backTo;
  return <div data-testid="backto">{backTo ?? "none"}</div>;
}

describe("HamburgerMenu seeds backTo on the Profile link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.loadState = { status: "loaded", profile: makeProfile() };
  });

  function renderMenuAt(pathname: string) {
    render(
      <MemoryRouter initialEntries={[pathname]}>
        <HamburgerMenu open onClose={() => {}} />
        <Routes>
          <Route path="/profile" element={<BackToProbe />} />
          <Route path="*" element={<div />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("Profile link carries the current path as backTo so 'Done' can return there", () => {
    renderMenuAt("/dashboard");
    fireEvent.click(screen.getByRole("link", { name: /^profile$/i }));
    expect(screen.getByTestId("backto")).toHaveTextContent("/dashboard");
  });

  it("does not set backTo when already on the Profile screen", () => {
    renderMenuAt("/profile");
    fireEvent.click(screen.getByRole("link", { name: /^profile$/i }));
    expect(screen.getByTestId("backto")).toHaveTextContent("none");
  });

  it("preserves the current query string in backTo (so ?date=… survives)", () => {
    renderMenuAt("/competition?date=2026-06-10");
    fireEvent.click(screen.getByRole("link", { name: /^profile$/i }));
    expect(screen.getByTestId("backto")).toHaveTextContent(
      "/competition?date=2026-06-10",
    );
  });
});
