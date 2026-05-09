// @vitest-environment jsdom
//
// Cross-surface verification that custom metrics respect the user's
// tracked-IDs preference the same way built-in metrics do — i.e.,
// untracked customs disappear from the wellness log, the performance
// log, and the dashboard chart picker, mirroring the behavior of
// untracked built-ins. Until the variant cherry-pick (commit 4e4b6a9
// + the wiring follow-up c4ee0aa), customs always appeared regardless
// of trackedIds; the comment in each surface flagged this as a "demo
// decision: no per-custom checkbox" that the variant integration
// invalidated.
//
// One file rather than three because the behavior under test is the
// same in all three components, just with different render harnesses.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CustomMetricDef } from "../types/customMetrics";
import type { ProfileLoadState, UserProfile } from "../types/profile";
import type {
  DataLoadState,
  PerformanceEntry,
  WellnessEntry,
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

// UserContext is mutated per test to swap profile.trackedWellnessMetrics
// / trackedPerformanceMetrics. The shape mirrors the lightweight ctx
// pattern WellnessLog.test.tsx already uses.
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
      trackedWellnessMetrics: [] as string[],
      trackedPerformanceMetrics: [] as string[],
      profileComplete: true,
      trackingSetupComplete: true,
    } as UserProfile,
  } as ProfileLoadState,
}));
vi.mock("../contexts/UserContext", () => ({
  useUser: () => userMock,
}));

// DataContext: stubbed wellness/performance load state. setX handlers
// are noops; tests don't exercise the write path.
const dataMock = vi.hoisted(() => ({
  wellness: {
    status: "loaded",
    entries: [] as WellnessEntry[],
  } as DataLoadState<WellnessEntry>,
  performance: {
    status: "loaded",
    entries: [] as PerformanceEntry[],
  } as DataLoadState<PerformanceEntry>,
  setWellnessEntry: vi.fn(),
  setPerformanceEntry: vi.fn(),
}));
vi.mock("../contexts/DataContext", () => ({
  useData: () => dataMock,
  useWellnessData: () => dataMock.wellness,
  usePerformanceData: () => dataMock.performance,
}));

// DemoMode: dashboard-only dep; default false so no random data is
// generated.
vi.mock("../contexts/DemoModeContext", () => ({
  useDemoMode: () => false,
}));

import { WellnessLog } from "./logs/WellnessLog";
import { PerformanceLog } from "./logs/PerformanceLog";
import { DashboardChartCard } from "./dashboard/DashboardChartCard";

function customDef(
  id: string,
  name: string,
  metricType: "wellness" | "performance",
): CustomMetricDef {
  return {
    id,
    ownerId: "u1",
    name,
    metricType,
    inputType: "numeric",
    unit: "",
    goalRaw: 0,
    yTopRaw: 10,
    yBottomRaw: 0,
    avgDecimals: 1,
    referenceUrl: "",
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("WellnessLog — customs respect tracked-IDs filter", () => {
  it("hides a custom whose id is NOT in trackedWellnessMetrics", () => {
    customMetricsMock.metrics = [customDef("c_w", "Stretch Time", "wellness")];
    userMock.loadState = {
      status: "loaded",
      profile: {
        ...(userMock.loadState as { profile: UserProfile }).profile,
        trackedWellnessMetrics: ["hydration", "sleepTime"], // no c_w
      },
    };
    render(
      <MemoryRouter>
        <WellnessLog />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Stretch Time")).toBeNull();
  });

  it("renders a custom whose id IS in trackedWellnessMetrics", () => {
    customMetricsMock.metrics = [customDef("c_w", "Stretch Time", "wellness")];
    userMock.loadState = {
      status: "loaded",
      profile: {
        ...(userMock.loadState as { profile: UserProfile }).profile,
        trackedWellnessMetrics: ["hydration", "c_w"],
      },
    };
    render(
      <MemoryRouter>
        <WellnessLog />
      </MemoryRouter>,
    );
    expect(screen.getByText("Stretch Time")).toBeInTheDocument();
  });
});

describe("PerformanceLog — customs respect tracked-IDs filter", () => {
  it("hides a custom whose id is NOT in trackedPerformanceMetrics", () => {
    customMetricsMock.metrics = [customDef("c_p", "5K Time", "performance")];
    userMock.loadState = {
      status: "loaded",
      profile: {
        ...(userMock.loadState as { profile: UserProfile }).profile,
        trackedPerformanceMetrics: ["wins", "goals"], // no c_p
      },
    };
    render(
      <MemoryRouter>
        <PerformanceLog />
      </MemoryRouter>,
    );
    expect(screen.queryByText("5K Time")).toBeNull();
  });

  it("renders a custom whose id IS in trackedPerformanceMetrics", () => {
    customMetricsMock.metrics = [customDef("c_p", "5K Time", "performance")];
    userMock.loadState = {
      status: "loaded",
      profile: {
        ...(userMock.loadState as { profile: UserProfile }).profile,
        trackedPerformanceMetrics: ["wins", "c_p"],
      },
    };
    render(
      <MemoryRouter>
        <PerformanceLog />
      </MemoryRouter>,
    );
    expect(screen.getByText("5K Time")).toBeInTheDocument();
  });
});

describe("DashboardChartCard — customs respect tracked-IDs filter", () => {
  function selectOptions(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("option")).map(
      (o) => (o as HTMLOptionElement).value,
    );
  }

  it("omits an untracked wellness custom from the dropdown", () => {
    customMetricsMock.metrics = [customDef("c_w", "Stretch Time", "wellness")];
    const { container } = render(
      <DashboardChartCard
        type="wellness"
        trackedMetricIds={["hydration"]} // c_w omitted
        wellnessEntries={[]}
      />,
    );
    expect(selectOptions(container)).toContain("hydration");
    expect(selectOptions(container)).not.toContain("c_w");
  });

  it("includes a tracked wellness custom in the dropdown", () => {
    customMetricsMock.metrics = [customDef("c_w", "Stretch Time", "wellness")];
    const { container } = render(
      <DashboardChartCard
        type="wellness"
        trackedMetricIds={["hydration", "c_w"]}
        wellnessEntries={[]}
      />,
    );
    expect(selectOptions(container)).toContain("c_w");
  });
});
