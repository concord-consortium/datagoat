// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ProfileLoadState, UserProfile } from "../../types/profile";
import type { DataLoadState, HealthEntry } from "../../types/data";
import { HISTORY, dateAtOffset, toISO } from "../../utils/dates";

const PROFILE: UserProfile = {
  version: 1,
  fullName: "T",
  email: "t@e.com",
  nickname: "",
  age: 18,
  heightFt: 5,
  heightIn: 9,
  weight: 150,
  gender: "male",
  athleteType: "endurance",
  competitionTerm: "game",
  trackedHealthMetrics: ["hydration"],
  trackedPerformanceMetrics: [],
  trackedCompetitionMetrics: [],
  profileComplete: true,
  trackingSetupComplete: true,
};

const ctx = vi.hoisted(() => ({
  loadState: { status: "loaded" } as ProfileLoadState,
  health: { status: "loaded", entries: [] } as DataLoadState<HealthEntry>,
}));

vi.mock("../../contexts/UserContext", () => ({ useUser: () => ({ loadState: ctx.loadState }) }));
vi.mock("../../contexts/DataContext", () => ({
  useData: () => ({
    health: ctx.health,
    performance: { status: "loaded", entries: [] },
    competition: { status: "loaded", entries: [] },
  }),
}));
vi.mock("../../contexts/CustomMetricsContext", () => ({
  useCustomMetrics: () => ({ metrics: [] }),
}));
vi.mock("../../contexts/MetricOverridesContext", () => ({
  useMetricOverrides: () => ({ getOverride: () => undefined }),
}));
vi.mock("./DashboardChartCard", () => ({ DashboardChartCard: () => null }));
vi.mock("./CodapButton", () => ({ CodapButton: () => null }));

import { Dashboard } from "./Dashboard";

beforeEach(() => {
  ctx.loadState = { status: "loaded", profile: PROFILE } as ProfileLoadState;
  ctx.health = { status: "loaded", entries: [] } as DataLoadState<HealthEntry>;
});

describe("Dashboard", () => {
  it("ignores a stored tracked id for a removed metric", () => {
    // relativeProteinIntake was removed as a metric but older profiles still
    // list it. With hydration filled, today must read as complete in both the
    // health CTA and the activity calendar.
    ctx.loadState = {
      status: "loaded",
      profile: { ...PROFILE, trackedHealthMetrics: ["hydration", "relativeProteinIntake"] },
    } as ProfileLoadState;
    const todayIso = toISO(dateAtOffset(HISTORY));
    ctx.health = {
      status: "loaded",
      entries: [{ version: 1, date: todayIso, hydration: 3, availability: {} }],
    } as DataLoadState<HealthEntry>;

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(screen.getByText("Great! You've logged everything due today!")).toBeTruthy();
    expect(screen.getByText(/\(today\): all metrics logged/)).toBeTruthy();
  });
});
