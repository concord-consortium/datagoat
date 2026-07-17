// @vitest-environment jsdom
//
// Cross-surface verification that custom metrics respect the user's
// tracked-IDs preference the same way built-in metrics do — i.e.,
// untracked customs disappear from the merged metrics log and the
// dashboard chart picker, mirroring the behavior of untracked built-ins.
// Until the variant cherry-pick (commit 4e4b6a9 + the wiring follow-up
// c4ee0aa), customs always appeared regardless of trackedIds; the comment
// in each surface flagged this as a "demo decision: no per-custom
// checkbox" that the variant integration invalidated.
//
// The log-page coverage below renders MetricsDataEntryLog, the merged
// health/performance/competition log at /log, rather than the old
// per-type pages the merge replaced. Rows there are grouped into
// frequency accordions, and only Daily is open by default, so each
// test opens whichever section its metric's schedule resolves to
// before asserting on it.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CustomMetricDef } from "../types/customMetrics";
import type { ProfileLoadState, UserProfile } from "../types/profile";
import type {
  CompetitionEntry,
  DataLoadState,
  HealthEntry,
  PerformanceEntry,
} from "../types/data";

// Hoisted mock state — each test mutates `customMetricsMock.metrics`
// before rendering. NOOP impls are fine because none of these tests
// dispatch a write.
const customMetricsMock = vi.hoisted(() => ({
  metrics: [] as CustomMetricDef[],
  loading: false,
  addMetric: vi.fn(),
  updateMetric: vi.fn(),
  deleteMetric: vi.fn(),
  getMetric: vi.fn(),
}));
vi.mock("../contexts/CustomMetricsContext", async () => {
  const actual = await vi.importActual<
    typeof import("../contexts/CustomMetricsContext")
  >("../contexts/CustomMetricsContext");
  return {
    ...actual,
    useCustomMetrics: () => customMetricsMock,
  };
});

// useAuth → noop user; the customs mock already short-circuits the
// CustomMetricsContext subscription, but other modules in the import
// graph may touch it.
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1" } }),
}));

// UserContext is mutated per test to swap profile.trackedHealthMetrics /
// trackedCompetitionMetrics. trackedPerformanceMetrics is pinned to []
// throughout so the default (untracked) performance registry doesn't
// bleed unrelated rows into these tests, which only care about health
// and competition.
const userMock = vi.hoisted(() => ({
  loadState: {
    status: "loaded",
    profile: {
      version: 1,
      fullName: "T",
      email: "t@e.com",
      nickname: "",
      age: 18,
      heightFt: 5,
      heightIn: 9,
      weight: 150,
      gender: "male" as const,
      athleteType: "endurance" as const,
      competitionTerm: "game",
      trackedHealthMetrics: [] as string[],
      trackedPerformanceMetrics: [] as string[],
      trackedCompetitionMetrics: [] as string[],
      profileComplete: true,
      trackingSetupComplete: true,
    } as UserProfile,
  } as ProfileLoadState,
}));
vi.mock("../contexts/UserContext", () => ({
  useUser: () => userMock,
}));

// DataContext: stubbed health/performance/competition load state. setX
// handlers are noops; tests don't exercise the write path.
const dataMock = vi.hoisted(() => ({
  health: {
    status: "loaded",
    entries: [] as HealthEntry[],
  } as DataLoadState<HealthEntry>,
  performance: {
    status: "loaded",
    entries: [] as PerformanceEntry[],
  } as DataLoadState<PerformanceEntry>,
  competition: {
    status: "loaded",
    entries: [] as CompetitionEntry[],
  } as DataLoadState<CompetitionEntry>,
  setHealthEntry: vi.fn(),
  setPerformanceEntry: vi.fn(),
  setCompetitionEntry: vi.fn(),
}));
vi.mock("../contexts/DataContext", () => ({
  useData: () => dataMock,
}));

// MetricOverridesContext: MetricsDataEntryLog resolves each tracked
// metric's schedule (and therefore its accordion section) through this
// context. No overrides in these tests - schedule comes straight from
// the built-in registry or the custom def under test.
vi.mock("../contexts/MetricOverridesContext", () => ({
  useMetricOverrides: () => ({ getOverride: () => undefined }),
}));

// DemoMode: dashboard-only dep; default false so no random data is
// generated.
vi.mock("../contexts/DemoModeContext", () => ({
  useDemoMode: () => false,
}));

import { MetricsDataEntryLog } from "./logs/MetricsDataEntryLog";
import { DashboardChartCard } from "./dashboard/DashboardChartCard";

function customDef(
  id: string,
  name: string,
  metricType: "health" | "competition",
  schedule?: CustomMetricDef["schedule"],
): CustomMetricDef {
  return {
    id,
    ownerId: "u1",
    name,
    metricType,
    primitive: "numeric",
    inputType: "numeric",
    unit: "",
    goalRaw: 0,
    yTopRaw: 10,
    yBottomRaw: 0,
    avgDecimals: 1,
    referenceUrl: "",
    createdAt: 0,
    updatedAt: 0,
    schedule,
  };
}

function renderLog() {
  return render(
    <MemoryRouter>
      <MetricsDataEntryLog />
    </MemoryRouter>,
  );
}

// Custom metrics under test here have no explicit schedule, so they
// resolve to the "irregular" default and land in As Needed, which is
// collapsed by default. Open it so a mistakenly-rendered row would
// actually be found (a query against a collapsed section would find
// nothing either way, which would make the "hides" case pass for the
// wrong reason).
function openAsNeeded() {
  fireEvent.click(screen.getByRole("button", { name: /As Needed Metrics/ }));
}

describe("MetricsDataEntryLog — health customs respect tracked-IDs filter", () => {
  it("hides a custom whose id is NOT in trackedHealthMetrics", () => {
    customMetricsMock.metrics = [customDef("c_w", "Stretch Time", "health")];
    userMock.loadState = {
      status: "loaded",
      profile: {
        ...(userMock.loadState as { profile: UserProfile }).profile,
        trackedHealthMetrics: ["hydration", "sleepTime"], // no c_w
      },
    };
    renderLog();
    openAsNeeded();
    expect(screen.queryByText("Stretch Time")).toBeNull();
  });

  it("renders a custom whose id IS in trackedHealthMetrics", () => {
    customMetricsMock.metrics = [customDef("c_w", "Stretch Time", "health")];
    userMock.loadState = {
      status: "loaded",
      profile: {
        ...(userMock.loadState as { profile: UserProfile }).profile,
        trackedHealthMetrics: ["hydration", "c_w"],
      },
    };
    renderLog();
    openAsNeeded();
    expect(screen.getByText("Stretch Time")).toBeInTheDocument();
  });
});

describe("MetricsDataEntryLog — competition customs respect tracked-IDs filter", () => {
  it("hides a custom whose id is NOT in trackedCompetitionMetrics", () => {
    customMetricsMock.metrics = [customDef("c_p", "5K Time", "competition")];
    userMock.loadState = {
      status: "loaded",
      profile: {
        ...(userMock.loadState as { profile: UserProfile }).profile,
        trackedCompetitionMetrics: ["wins", "goals"], // no c_p
      },
    };
    renderLog();
    openAsNeeded();
    expect(screen.queryByText("5K Time")).toBeNull();
  });

  it("renders a custom whose id IS in trackedCompetitionMetrics", () => {
    customMetricsMock.metrics = [customDef("c_p", "5K Time", "competition")];
    userMock.loadState = {
      status: "loaded",
      profile: {
        ...(userMock.loadState as { profile: UserProfile }).profile,
        trackedCompetitionMetrics: ["wins", "c_p"],
      },
    };
    renderLog();
    openAsNeeded();
    expect(screen.getByText("5K Time")).toBeInTheDocument();
  });
});

describe("DashboardChartCard — customs respect tracked-IDs filter", () => {
  function selectOptions(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("option")).map(
      (o) => (o as HTMLOptionElement).value,
    );
  }

  it("omits an untracked health custom from the dropdown", () => {
    customMetricsMock.metrics = [customDef("c_w", "Stretch Time", "health")];
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration"]} // c_w omitted
        healthEntries={[]}
      />,
    );
    expect(selectOptions(container)).toContain("hydration");
    expect(selectOptions(container)).not.toContain("c_w");
  });

  it("includes a tracked health custom in the dropdown", () => {
    customMetricsMock.metrics = [customDef("c_w", "Stretch Time", "health")];
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration", "c_w"]}
        healthEntries={[]}
      />,
    );
    expect(selectOptions(container)).toContain("c_w");
  });

  it("renders dropdown options in trackedMetricIds order, not registry order", () => {
    // Drag-reorder on /setup/tracking persists `trackedMetricIds`;
    // a custom dragged BETWEEN two built-ins should appear in that
    // slot in the picker, not be appended at the bottom.
    customMetricsMock.metrics = [customDef("c_w", "Stretch Time", "health")];
    const { container } = render(
      <DashboardChartCard
        type="health"
        // Built-in → custom → built-in. Note c_w sits between two
        // built-ins; the prior bug appended customs after all
        // built-ins regardless of trackedMetricIds order.
        trackedMetricIds={["hydration", "c_w", "sleepTime"]}
        healthEntries={[]}
      />,
    );
    // DashboardChartCard always has a metric selected (tracked[0]), so
    // SelectField omits the disabled "Select …" placeholder option --
    // every rendered option is a real metric.
    expect(selectOptions(container)).toEqual([
      "hydration",
      "c_w",
      "sleepTime",
    ]);
  });
});

describe("MetricsDataEntryLog — drag-reorder is respected in row order", () => {
  it("renders rows in trackedHealthMetrics order with customs interleaved", () => {
    // Pinned to a daily schedule so it lands in the same accordion
    // section (Daily, open by default) as the two built-ins below.
    // MetricsDataEntryLog groups rows by frequency first, so proving
    // drag-order survives the merge only makes sense within a single
    // section - cross-section position is no longer meaningful, since
    // grouping (not tracked-array position) decides where a row lands.
    customMetricsMock.metrics = [
      customDef("c_w", "Stretch Time", "health", { period: "daily" }),
    ];
    userMock.loadState = {
      status: "loaded",
      profile: {
        ...(userMock.loadState as { profile: UserProfile }).profile,
        // Custom slotted between two built-ins (mirrors a user
        // dragging it there on /setup/tracking).
        trackedHealthMetrics: ["hydration", "c_w", "sleepTime"],
      },
    };
    const { container } = renderLog();
    // Read the rendered metric-name column in order. Each MetricInputRow
    // renders the name as a Link inside a `td.metricName` cell.
    const names = Array.from(
      container.querySelectorAll("td.metricName, td[class*='metricName']"),
    ).map((el) => el.textContent?.trim() ?? "");
    // Names are SR-formatted by MetricInputRow (built-ins use their
    // registry name); we only need their relative order.
    const idx = (needle: string) =>
      names.findIndex((n) => n.toLowerCase().includes(needle.toLowerCase()));
    expect(idx("hydration")).toBeGreaterThanOrEqual(0);
    expect(idx("stretch time")).toBeGreaterThan(idx("hydration"));
    expect(idx("sleep time")).toBeGreaterThan(idx("stretch time"));
  });
});
