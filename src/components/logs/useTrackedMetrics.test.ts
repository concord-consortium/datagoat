// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ProfileLoadState, UserProfile } from "../../types/profile";
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
  trackedHealthMetrics: [],
  trackedPerformanceMetrics: [],
  trackedCompetitionMetrics: [],
  profileComplete: true,
  trackingSetupComplete: true,
};

const ctx = vi.hoisted(() => ({
  loadState: { status: "loaded" } as ProfileLoadState,
  customMetrics: [] as CustomMetricDef[],
  overrides: {} as Record<string, { schedule?: { period: string; count?: number } }>,
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ loadState: ctx.loadState }),
}));
vi.mock("../../contexts/CustomMetricsContext", () => ({
  useCustomMetrics: () => ({ metrics: ctx.customMetrics }),
}));
vi.mock("../../contexts/MetricOverridesContext", () => ({
  useMetricOverrides: () => ({ getOverride: (id: string) => ctx.overrides[id] }),
}));

import { useTrackedMetrics } from "./useTrackedMetrics";

function setProfile(patch: Partial<UserProfile>) {
  ctx.loadState = {
    status: "loaded",
    profile: { ...PROFILE, ...patch },
  } as ProfileLoadState;
}

beforeEach(() => {
  ctx.customMetrics = [];
  ctx.overrides = {};
  setProfile({});
});

describe("useTrackedMetrics", () => {
  it("sections built-in metrics by their schedule", () => {
    // hydration is {period: "daily"}; leanMass is {period: "yearly", count: 2}.
    setProfile({ trackedHealthMetrics: ["hydration", "leanMass"] });
    const { result } = renderHook(() => useTrackedMetrics());
    expect(result.current.map((m) => [m.id, m.section])).toEqual([
      ["hydration", "daily"],
      ["leanMass", "yearly"],
    ]);
  });

  it("sections a quarterly performance metric under quarterly", () => {
    // oneMileRun is {period: "yearly", count: 4}. This is the prototype's
    // "My Mile" row under QUARTERLY.
    setProfile({ trackedPerformanceMetrics: ["oneMileRun"] });
    const { result } = renderHook(() => useTrackedMetrics());
    expect(result.current[0].section).toBe("quarterly");
    expect(result.current[0].type).toBe("performance");
  });

  it("sections schedule-less competition metrics as needed", () => {
    setProfile({ trackedCompetitionMetrics: ["scores"] });
    const { result } = renderHook(() => useTrackedMetrics());
    expect(result.current[0].section).toBe("asNeeded");
  });

  it("orders health, then performance, then competition, preserving drag order", () => {
    setProfile({
      trackedHealthMetrics: ["leanMass", "hydration"],
      trackedPerformanceMetrics: ["oneMileRun"],
      trackedCompetitionMetrics: ["scores"],
    });
    const { result } = renderHook(() => useTrackedMetrics());
    expect(result.current.map((m) => m.id)).toEqual([
      "leanMass",
      "hydration",
      "oneMileRun",
      "scores",
    ]);
  });

  it("lets a user override win over the metric's own schedule", () => {
    setProfile({ trackedHealthMetrics: ["hydration"] });
    ctx.overrides = { hydration: { schedule: { period: "weekly" } } };
    const { result } = renderHook(() => useTrackedMetrics());
    expect(result.current[0].section).toBe("weekly");
  });

  it("resolves custom metrics and their schedules", () => {
    ctx.customMetrics = [
      {
        id: "c1",
        name: "My Mile",
        metricType: "performance",
        primitive: "numeric",
        schedule: { period: "yearly", count: 4 },
      } as CustomMetricDef,
    ];
    setProfile({ trackedPerformanceMetrics: ["c1"] });
    const { result } = renderHook(() => useTrackedMetrics());
    expect(result.current[0].name).toBe("My Mile");
    expect(result.current[0].section).toBe("quarterly");
    expect(result.current[0].customDef?.id).toBe("c1");
  });

  it("skips ids that resolve to neither a built-in nor a live custom", () => {
    setProfile({ trackedHealthMetrics: ["hydration", "deleted-custom-id"] });
    const { result } = renderHook(() => useTrackedMetrics());
    expect(result.current.map((m) => m.id)).toEqual(["hydration"]);
  });
});
