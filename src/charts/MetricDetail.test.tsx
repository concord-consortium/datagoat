// @vitest-environment jsdom
//
// Verifies MetricDetail's custom-metric handling — the cross-type
// filter (`m.metricType === type`) and the loading gate that prevents
// a deep-link from bouncing back to the log before the customs
// snapshot resolves. Both paths were added in commits 65028ce and
// f6600b8 and aren't covered by the in-place chart-engine tests.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import type { CustomMetricDef } from "../types/customMetrics";
import type { ProfileLoadState, UserProfile } from "../types/profile";
import type {
  DataLoadState,
  PerformanceEntry,
  WellnessEntry,
} from "../types/data";

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
      trackedWellnessMetrics: [],
      trackedPerformanceMetrics: [],
      profileComplete: true,
      trackingSetupComplete: true,
    } as UserProfile,
  } as ProfileLoadState,
}));
vi.mock("../contexts/UserContext", () => ({
  useUser: () => userMock,
}));

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

vi.mock("../contexts/DemoModeContext", () => ({
  useDemoMode: () => false,
}));

import { MetricDetail } from "./MetricDetail";

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
    goalRaw: 5,
    yTopRaw: 10,
    yBottomRaw: 0,
    avgDecimals: 1,
    createdAt: 0,
    updatedAt: 0,
  };
}

// Probes the current pathname into the DOM so a Navigate-based
// redirect can be asserted by reading `data-testid="loc"`.
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname}</div>;
}

function renderAt(
  path: string,
  type: "wellness" | "performance",
): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={`/${type}`} element={<div data-testid="log-fallback" />} />
        <Route
          path={`/${type}/:metricId`}
          element={<MetricDetail type={type} />}
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("MetricDetail — custom-metric handling", () => {
  it("renders a wellness custom metric's name as the chart title", () => {
    customMetricsMock.metrics = [customDef("c_w", "Stretch Time", "wellness")];
    customMetricsMock.loading = false;
    renderAt("/wellness/c_w", "wellness");
    // "Your <name>" is the chart-section title; rendered twice (visible
    // and SR <title>), so getAllByText.
    expect(
      screen.getAllByText(/your stretch time/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("redirects when a wellness URL targets a performance-typed custom", () => {
    customMetricsMock.metrics = [customDef("c_p", "5K Time", "performance")];
    customMetricsMock.loading = false;
    renderAt("/wellness/c_p", "wellness");
    // Cross-type access falls through to the not-found Navigate that
    // bounces to /wellness. Without the metricType filter, MetricDetail
    // would render but read from the wrong entry map.
    expect(screen.getByTestId("loc").textContent).toBe("/wellness");
    expect(screen.getByTestId("log-fallback")).toBeInTheDocument();
  });

  it("waits for the customs snapshot before deciding 'not found'", () => {
    // customs are still loading and the id isn't a built-in → render
    // a Loading… placeholder rather than Navigate'ing away. Without
    // this gate, a deep-link/refresh on /wellness/c_xyz would bounce
    // before the metric resolves.
    customMetricsMock.metrics = [];
    customMetricsMock.loading = true;
    renderAt("/wellness/c_xyz", "wellness");
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    // Critical: did NOT navigate away.
    expect(screen.getByTestId("loc").textContent).toBe("/wellness/c_xyz");
  });
});
