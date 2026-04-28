// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ loadState: ctx.loadState }),
}));

import { ProtectedRoute, OnboardingRoute } from "./ProtectedRoute";

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
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
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

  it("redirects to /login when no auth user", () => {
    ctx.user = null;
    ctx.loading = false;
    ctx.loadState = { status: "loading" };
    renderRoute(<ProtectedRoute />);
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
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
    trackedWellnessMetrics: [],
    trackedPerformanceMetrics: [],
    profileComplete: true,
    trackingSetupComplete: true,
    ...overrides,
  };
}
