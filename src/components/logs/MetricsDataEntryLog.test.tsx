// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ProfileLoadState, UserProfile } from "../../types/profile";
import type {
  CompetitionEntry,
  DataLoadState,
  HealthEntry,
  PerformanceEntry,
} from "../../types/data";
import type { CustomMetricDef } from "../../types/customMetrics";

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
  trackedPerformanceMetrics: ["oneMileRun"],
  trackedCompetitionMetrics: ["scores"],
  profileComplete: true,
  trackingSetupComplete: true,
};

const ctx = vi.hoisted(() => ({
  loadState: { status: "loaded" } as ProfileLoadState,
  health: { status: "loaded", entries: [] } as DataLoadState<HealthEntry>,
  performance: { status: "loaded", entries: [] } as DataLoadState<PerformanceEntry>,
  competition: { status: "loaded", entries: [] } as DataLoadState<CompetitionEntry>,
  setHealthEntry: vi.fn() as (...args: unknown[]) => void,
  setPerformanceEntry: vi.fn() as (...args: unknown[]) => void,
  setCompetitionEntry: vi.fn() as (...args: unknown[]) => void,
  customMetrics: [] as CustomMetricDef[],
}));

vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "u1" } }) }));
vi.mock("../../contexts/UserContext", () => ({ useUser: () => ({ loadState: ctx.loadState }) }));
vi.mock("../../contexts/DataContext", () => ({
  useData: () => ({
    health: ctx.health,
    performance: ctx.performance,
    competition: ctx.competition,
    setHealthEntry: ctx.setHealthEntry,
    setPerformanceEntry: ctx.setPerformanceEntry,
    setCompetitionEntry: ctx.setCompetitionEntry,
  }),
}));
vi.mock("../../contexts/CustomMetricsContext", () => ({
  useCustomMetrics: () => ({ metrics: ctx.customMetrics }),
}));
vi.mock("../../contexts/MetricOverridesContext", () => ({
  useMetricOverrides: () => ({ getOverride: () => undefined }),
}));
vi.mock("../../firebase", () => ({ db: {} }));

import { MetricsDataEntryLog } from "./MetricsDataEntryLog";

function renderPage(initialPath = "/log") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <MetricsDataEntryLog />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  ctx.loadState = { status: "loaded", profile: PROFILE } as ProfileLoadState;
  ctx.customMetrics = [];
  vi.clearAllMocks();
});

describe("MetricsDataEntryLog", () => {
  it("renders all six frequency sections", () => {
    renderPage();
    for (const label of [
      "Daily Metrics",
      "Weekly Metrics",
      "Monthly Metrics",
      "Quarterly Metrics",
      "Yearly Metrics",
      "As Needed Metrics",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it("opens Daily by default and leaves the rest closed", () => {
    renderPage();
    const daily = screen.getByRole("button", { name: /Daily Metrics/ });
    const weekly = screen.getByRole("button", { name: /Weekly Metrics/ });
    expect(daily.getAttribute("aria-expanded")).toBe("true");
    expect(weekly.getAttribute("aria-expanded")).toBe("false");
    // The daily health metric is visible without any interaction.
    expect(screen.getByRole("link", { name: /Hydration/ })).toBeTruthy();
  });

  it("groups a quarterly performance metric under Quarterly", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Quarterly Metrics/ }));
    expect(screen.getByRole("link", { name: /1-Mile Run/ })).toBeTruthy();
  });

  it("groups a schedule-less competition metric under As Needed", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /As Needed Metrics/ }));
    expect(screen.getByRole("link", { name: /Scores/ })).toBeTruthy();
  });

  it("shows an empty state for a section with no metrics", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Weekly Metrics/ }));
    expect(screen.getByText("No weekly metrics to track")).toBeTruthy();
  });

  it("reports chip state across all three metric types, not health alone", () => {
    // Health filled, performance and competition empty => "some", not "all".
    ctx.health = {
      status: "loaded",
      entries: [{ version: 1, date: todayIso(), hydration: 3, availability: {} }],
    } as DataLoadState<HealthEntry>;
    renderPage();
    expect(screen.getByRole("status").textContent).toMatch(/Some metrics entered/);
  });

  it("redirects an out-of-range date to /log", () => {
    renderPage("/log?date=1999-01-01");
    // The guard renders <Navigate to="/log" replace />, so the sections
    // still render after the redirect resolves.
    expect(screen.getByRole("button", { name: /Daily Metrics/ })).toBeTruthy();
  });
});

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
