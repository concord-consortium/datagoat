// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

import type { ProfileLoadState } from "../../types/profile";

// Hoisted mock state - reset per case, controls both auth + user contexts.
const ctx = vi.hoisted(() => ({
  user: { uid: "u1" } as { uid: string } | null,
  loading: false,
  loadState: { status: "loading" } as ProfileLoadState,
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: ctx.user, loading: ctx.loading }),
}));

const retryMock = vi.fn();

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ loadState: ctx.loadState, retry: retryMock }),
}));

import { ProtectedRoute, OnboardingRoute } from "./ProtectedRoute";
import { markReturningUser } from "./returningUser";

function renderRoute(
  guard: ReactNode,
  initialEntry = "/dashboard",
  childPath = "/dashboard",
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={guard}>
          <Route path={childPath} element={<div>CHILD</div>} />
        </Route>
        <Route path="/profile" element={<div>PROFILE</div>} />
        <Route path="/setup/tracking" element={<div>TRACKING</div>} />
        <Route path="/login" element={<div>LOGIN</div>} />
        <Route path="/signup" element={<div>SIGNUP</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    retryMock.mockClear();
    // The returning-user flag is device-local (localStorage); isolate cases.
    localStorage.clear();
  });

  it("renders <Loading /> when loadState.status is 'loading' (does not redirect)", () => {
    ctx.user = { uid: "u1" };
    ctx.loading = false;
    ctx.loadState = { status: "loading" };
    renderRoute(<ProtectedRoute />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText("CHILD")).toBeNull();
    expect(screen.queryByText("PROFILE")).toBeNull();
  });

  it("redirects to /profile when loadState.status is 'missing'", () => {
    ctx.user = { uid: "u1" };
    ctx.loading = false;
    ctx.loadState = { status: "missing" };
    renderRoute(<ProtectedRoute />);
    expect(screen.getByText("PROFILE")).toBeInTheDocument();
  });

  it("renders the child when loadState.status is 'loaded'", () => {
    ctx.user = { uid: "u1" };
    ctx.loading = false;
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({ profileComplete: true }),
    };
    renderRoute(<ProtectedRoute />);
    expect(screen.getByText("CHILD")).toBeInTheDocument();
  });

  it("redirects to /profile when loaded but profileComplete is false", () => {
    ctx.user = { uid: "u1" };
    ctx.loading = false;
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({
        profileComplete: false,
        trackingSetupComplete: false,
      }),
    };
    renderRoute(<ProtectedRoute />);
    expect(screen.getByText("PROFILE")).toBeInTheDocument();
    expect(screen.queryByText("CHILD")).toBeNull();
  });

  it("redirects to /setup/tracking when profileComplete but trackingSetupComplete is false", () => {
    // Bug fix: without this, a partway-onboarded user landed on /dashboard
    // and the HamburgerMenu gated every non-Profile item, leaving
    // /setup/tracking unreachable.
    ctx.user = { uid: "u1" };
    ctx.loading = false;
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({
        profileComplete: true,
        trackingSetupComplete: false,
      }),
    };
    renderRoute(<ProtectedRoute />);
    expect(screen.getByText("TRACKING")).toBeInTheDocument();
    expect(screen.queryByText("CHILD")).toBeNull();
    expect(screen.queryByText("PROFILE")).toBeNull();
  });

  it("renders the child with allowTrackingIncomplete even when trackingSetupComplete is false", () => {
    // Regression: /add-metric/* routes opt into allowTrackingIncomplete
    // so the Add Metric buttons on /setup/tracking can launch the
    // create form during the tracking-setup flow. Without this, the
    // gate is circular - the user can't add metrics until tracking is
    // complete, but tracking is completed by adding metrics.
    ctx.user = { uid: "u1" };
    ctx.loading = false;
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({
        profileComplete: true,
        trackingSetupComplete: false,
      }),
    };
    renderRoute(<ProtectedRoute allowTrackingIncomplete />);
    expect(screen.getByText("CHILD")).toBeInTheDocument();
    expect(screen.queryByText("TRACKING")).toBeNull();
  });

  it("still redirects to /profile with allowTrackingIncomplete when profileComplete is false", () => {
    // allowTrackingIncomplete only skips the trackingSetupComplete
    // redirect; the profileComplete gate still applies, so a user
    // who hasn't even started onboarding can't deep-link to an
    // /add-metric/* URL.
    ctx.user = { uid: "u1" };
    ctx.loading = false;
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({
        profileComplete: false,
        trackingSetupComplete: false,
      }),
    };
    renderRoute(<ProtectedRoute allowTrackingIncomplete />);
    expect(screen.getByText("PROFILE")).toBeInTheDocument();
    expect(screen.queryByText("CHILD")).toBeNull();
  });

  it("redirects first-time visitors to /signup when no auth user", () => {
    ctx.user = null;
    ctx.loading = false;
    ctx.loadState = { status: "loading" };
    renderRoute(<ProtectedRoute />);
    expect(screen.getByText("SIGNUP")).toBeInTheDocument();
    expect(screen.queryByText("LOGIN")).toBeNull();
  });

  it("redirects returning visitors to /login when no auth user", () => {
    markReturningUser();
    ctx.user = null;
    ctx.loading = false;
    ctx.loadState = { status: "loading" };
    renderRoute(<ProtectedRoute />);
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
    expect(screen.queryByText("SIGNUP")).toBeNull();
  });

  it("renders the retry UI on 'error' kind 'subscription' (does NOT redirect to /profile)", () => {
    ctx.user = { uid: "u1" };
    ctx.loading = false;
    ctx.loadState = {
      status: "error",
      error: new Error("net"),
      kind: "subscription",
    };
    renderRoute(<ProtectedRoute />);
    // Load-bearing assertion: a transient snapshot error must not drop the
    // user into onboarding, where submit would clobber their real profile.
    expect(screen.queryByText("PROFILE")).toBeNull();
    expect(screen.queryByText("CHILD")).toBeNull();
    expect(screen.getByText(/check your connection/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(retryBtn);
    expect(retryMock).toHaveBeenCalledTimes(1);
  });

  it("renders the support-escalation copy on 'error' kind 'migration'", () => {
    ctx.user = { uid: "u1" };
    ctx.loading = false;
    ctx.loadState = {
      status: "error",
      error: new Error("bad shape"),
      kind: "migration",
    };
    renderRoute(<ProtectedRoute />);
    // Load-bearing assertion: a migration failure on the singleton profile
    // must not redirect to /profile - the onboarding submit would clobber
    // the unmigrated doc via setDoc(merge:true).
    expect(screen.queryByText("PROFILE")).toBeNull();
    expect(screen.queryByText("CHILD")).toBeNull();
    expect(screen.getByText(/contact support/i)).toBeInTheDocument();
    expect(screen.queryByText(/check your connection/i)).toBeNull();
  });
});

describe("OnboardingRoute", () => {
  it("renders <Loading /> on 'loading'", () => {
    ctx.user = { uid: "u1" };
    ctx.loading = false;
    ctx.loadState = { status: "loading" };
    renderRoute(<OnboardingRoute />, "/profile", "/profile");
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders the child on 'missing' (does NOT redirect)", () => {
    ctx.user = { uid: "u1" };
    ctx.loading = false;
    ctx.loadState = { status: "missing" };
    renderRoute(<OnboardingRoute />, "/profile", "/profile");
    expect(screen.getByText("CHILD")).toBeInTheDocument();
  });

  it("renders the child on 'loaded'", () => {
    ctx.user = { uid: "u1" };
    ctx.loading = false;
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({ profileComplete: true }),
    };
    renderRoute(<OnboardingRoute />, "/profile", "/profile");
    expect(screen.getByText("CHILD")).toBeInTheDocument();
  });

  it("renders the retry UI on 'error' kind 'subscription' (blocks the form so submit can't clobber a real profile)", () => {
    ctx.user = { uid: "u1" };
    ctx.loading = false;
    ctx.loadState = {
      status: "error",
      error: new Error("net"),
      kind: "subscription",
    };
    renderRoute(<OnboardingRoute />, "/profile", "/profile");
    expect(screen.queryByText("CHILD")).toBeNull();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/check your connection/i)).toBeInTheDocument();
  });

  it("renders the support-escalation copy on 'error' kind 'migration' (blocks the form)", () => {
    ctx.user = { uid: "u1" };
    ctx.loading = false;
    ctx.loadState = {
      status: "error",
      error: new Error("bad shape"),
      kind: "migration",
    };
    renderRoute(<OnboardingRoute />, "/profile", "/profile");
    expect(screen.queryByText("CHILD")).toBeNull();
    expect(screen.getByText(/contact support/i)).toBeInTheDocument();
  });
});

import type { UserProfile } from "../../types/profile";

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
