// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  customDefToChartConfig,
  setCustomChartConfigs,
} from "../../charts/metricChartConfig";
import type { ProfileLoadState, UserProfile } from "../../types/profile";
import type {
  CompetitionEntry,
  DataLoadState,
  HealthEntry,
  PerformanceEntry,
} from "../../types/data";
import type { CustomMetricDef } from "../../types/customMetrics";
import type { MetricSchedule } from "../../types/metricSchedule";

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
  getOverride: (() => undefined) as (
    id: string,
  ) => { schedule?: MetricSchedule } | undefined,
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
  useMetricOverrides: () => ({ getOverride: ctx.getOverride }),
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
  ctx.health = { status: "loaded", entries: [] } as DataLoadState<HealthEntry>;
  ctx.performance = { status: "loaded", entries: [] } as DataLoadState<PerformanceEntry>;
  ctx.competition = { status: "loaded", entries: [] } as DataLoadState<CompetitionEntry>;
  ctx.customMetrics = [];
  ctx.getOverride = () => undefined;
  vi.clearAllMocks();
});

// The default fixture tracks a quarterly performance metric (oneMileRun) and
// an as-needed competition metric (scores); neither is due on any given day,
// so the completeness chip - which counts only the metrics scheduled today -
// would rightly ignore them. The chip tests below exist to prove the chip
// spans all three metric types, so they override both to a daily schedule,
// making them due today and part of the denominator alongside the daily
// health metric.
const dueDailyOverride = (id: string) =>
  id === "oneMileRun" || id === "scores"
    ? { schedule: { period: "daily" } as MetricSchedule }
    : undefined;

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

  it("reports 'some' when only health is filled (necessary but not sufficient proof of type coverage)", () => {
    // Health filled, performance and competition empty => "some", not "all".
    // Note: a health-only resolver produces the same "some" result for this
    // fixture (1 of 3 due metrics filled either way), so this case alone
    // does not prove the chip spans all three types. See the two tests below.
    ctx.getOverride = dueDailyOverride;
    ctx.health = {
      status: "loaded",
      entries: [{ version: 1, date: todayIso(), hydration: 3, availability: {} }],
    } as DataLoadState<HealthEntry>;
    renderPage();
    expect(screen.getByRole("status").textContent).toMatch(/Some metrics entered/);
  });

  it("reports 'some' when health is empty but performance and competition are filled", () => {
    // Health entirely empty, non-health metrics filled. A health-only
    // resolver would see nothing filled here and report "none" - so this
    // discriminates between a correct resolver and a health-only one.
    ctx.getOverride = dueDailyOverride;
    ctx.performance = {
      status: "loaded",
      entries: [{ version: 1, date: todayIso(), metrics: { oneMileRun: 420 } }],
    } as DataLoadState<PerformanceEntry>;
    ctx.competition = {
      status: "loaded",
      entries: [{ version: 1, date: todayIso(), metrics: { scores: 10 } }],
    } as DataLoadState<CompetitionEntry>;
    renderPage();
    expect(screen.getByRole("status").textContent).toMatch(/Some metrics entered/);
  });

  it("reports 'all' when health, performance, and competition are all filled", () => {
    // A health-only resolver would count just 1 of 3 due metrics as
    // filled here and report "some", not "all" - another discriminator.
    ctx.getOverride = dueDailyOverride;
    ctx.health = {
      status: "loaded",
      entries: [{ version: 1, date: todayIso(), hydration: 3, availability: {} }],
    } as DataLoadState<HealthEntry>;
    ctx.performance = {
      status: "loaded",
      entries: [{ version: 1, date: todayIso(), metrics: { oneMileRun: 420 } }],
    } as DataLoadState<PerformanceEntry>;
    ctx.competition = {
      status: "loaded",
      entries: [{ version: 1, date: todayIso(), metrics: { scores: 10 } }],
    } as DataLoadState<CompetitionEntry>;
    renderPage();
    expect(screen.getByRole("status").textContent).toMatch(/All metrics entered/);
  });

  it("reaches 'all' with only the due metric filled, ignoring not-due cadences", () => {
    // The default fixture also tracks oneMileRun (quarterly) and scores
    // (as-needed) - neither due today. They must not drag the chip below
    // "all": filling the day's only due metric (daily hydration) completes
    // the day. Counting not-due cadences is what made "all" unreachable.
    ctx.health = {
      status: "loaded",
      entries: [{ version: 1, date: todayIso(), hydration: 3, availability: {} }],
    } as DataLoadState<HealthEntry>;
    renderPage();
    expect(screen.getByRole("status").textContent).toMatch(/All metrics entered/);
  });

  it("reports 'all' when metrics are tracked but none are due today", () => {
    // No daily metric, only a quarterly + an as-needed metric - neither is ever
    // due on a given day, so nothing is scheduled to enter. The day is complete
    // by definition; the chip must read "all", not "none" ("No metrics entered"
    // would be misleading when there is nothing to enter).
    ctx.loadState = {
      status: "loaded",
      profile: {
        ...PROFILE,
        trackedHealthMetrics: [],
        trackedPerformanceMetrics: ["oneMileRun"],
        trackedCompetitionMetrics: ["scores"],
      },
    } as ProfileLoadState;
    renderPage();
    expect(screen.getByRole("status").textContent).toMatch(/All metrics entered/);
  });

  it("excludes the auto-calculated placeholder from completeness", () => {
    // relativeProteinIntake is a daily metric but renders as a non-enterable
    // "coming soon" placeholder, so it can never be filled. It must not pin
    // the chip below "all"; only the fillable daily hydration should count.
    ctx.loadState = {
      status: "loaded",
      profile: {
        ...PROFILE,
        trackedHealthMetrics: ["hydration", "relativeProteinIntake"],
      },
    } as ProfileLoadState;
    ctx.health = {
      status: "loaded",
      entries: [{ version: 1, date: todayIso(), hydration: 3, availability: {} }],
    } as DataLoadState<HealthEntry>;
    renderPage();
    expect(screen.getByRole("status").textContent).toMatch(/All metrics entered/);
  });

  it("redirects an out-of-range date to /log", () => {
    renderPage("/log?date=1999-01-01");
    // The guard renders <Navigate to="/log" replace />, so the sections
    // still render after the redirect resolves.
    expect(screen.getByRole("button", { name: /Daily Metrics/ })).toBeTruthy();
  });

  describe("time-formatted summary cells", () => {
    it("formats a time performance metric's Latest cell instead of the raw decimal", () => {
      // Regression: the Latest cell used to render String(live) even for
      // time metrics, so a stored 4.5 (4m30s) showed "4.5" instead of "4:30".
      ctx.performance = {
        status: "loaded",
        entries: [{ version: 1, date: todayIso(), metrics: { oneMileRun: 4.5 } }],
      } as DataLoadState<PerformanceEntry>;
      renderPage();
      // oneMileRun is quarterly, not daily - expand its section first or the
      // query below finds nothing and the assertion passes vacuously.
      fireEvent.click(screen.getByRole("button", { name: /Quarterly Metrics/ }));
      const row = screen.getByRole("link", { name: /1-Mile Run/ }).closest("tr")!;
      const summaryCell = row.querySelector("td")!;
      expect(summaryCell.textContent).toBe("4:30");
    });

    it("formats a time competition metric's Total cell instead of the raw decimal", () => {
      // Regression: the Total cell used to render String(total) even for
      // time metrics, so a stored 5.5 (5m30s) showed "5.5" instead of "5:30".
      ctx.loadState = {
        status: "loaded",
        profile: { ...PROFILE, trackedCompetitionMetrics: ["times"] },
      } as ProfileLoadState;
      ctx.competition = {
        status: "loaded",
        entries: [{ version: 1, date: todayIso(), metrics: { times: 5.5 } }],
      } as DataLoadState<CompetitionEntry>;
      renderPage();
      // "times" (like "scores") has no explicit schedule, so it lands in
      // As Needed, not Daily - expand it first.
      fireEvent.click(screen.getByRole("button", { name: /As Needed Metrics/ }));
      const row = screen.getByRole("link", { name: /Times/ }).closest("tr")!;
      const summaryCell = row.querySelector("td")!;
      expect(summaryCell.textContent).toBe("5:30");
    });
  });

  describe("custom time metric overlay reactivity", () => {
    const CUSTOM_TIME: CustomMetricDef = {
      id: "c_time",
      ownerId: "u1",
      name: "Plank Hold",
      metricType: "performance",
      primitive: "numeric",
      inputType: "numeric",
      unit: "min",
      timePrecision: "s",
      goalRaw: 1,
      yTopRaw: 5,
      yBottomRaw: 0,
      avgDecimals: 2,
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    };

    it("re-renders a custom time metric as a time input once the chart-config overlay syncs", () => {
      // The overlay is populated post-commit, so the row is numeric on first
      // paint; the page must subscribe (useChartConfigSync) so it flips to the
      // time input when the overlay syncs rather than staying numeric. This
      // guards the coupling that used to live on the per-type PerformanceLog.
      setCustomChartConfigs({});
      ctx.customMetrics = [CUSTOM_TIME];
      ctx.loadState = {
        status: "loaded",
        profile: { ...PROFILE, trackedPerformanceMetrics: ["c_time"] },
      } as ProfileLoadState;
      renderPage();
      // A schedule-less custom metric lands under As Needed, collapsed by
      // default - expand it so the row mounts.
      fireEvent.click(screen.getByRole("button", { name: /As Needed Metrics/ }));

      const findRow = () =>
        Array.from(document.querySelectorAll("tr")).find((r) =>
          r.textContent?.includes("Plank Hold"),
        )!;
      expect(findRow().querySelectorAll("input").length).toBe(1); // numeric, overlay stale

      act(() => {
        setCustomChartConfigs({ [CUSTOM_TIME.id]: customDefToChartConfig(CUSTOM_TIME) });
      });
      expect(findRow().querySelectorAll("input").length).toBeGreaterThanOrEqual(2);

      setCustomChartConfigs({}); // reset module overlay for other tests
    });
  });
});

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
