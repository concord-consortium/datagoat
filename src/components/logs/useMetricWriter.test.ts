// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { TrackedMetric } from "./useTrackedMetrics";

const setHealthEntry = vi.fn();
const setPerformanceEntry = vi.fn();
const setCompetitionEntry = vi.fn();

vi.mock("../../contexts/DataContext", () => ({
  useData: () => ({ setHealthEntry, setPerformanceEntry, setCompetitionEntry }),
}));

import { useMetricWriter } from "./useMetricWriter";

function tracked(id: string, type: TrackedMetric["type"]): TrackedMetric {
  return { id, name: id, type, section: "daily" };
}

describe("useMetricWriter", () => {
  it("routes a named health write to setHealthEntry", () => {
    const { result } = renderHook(() => useMetricWriter());
    result.current.setMetricValue(tracked("hydration", "health"), "2026-07-20", 4);
    expect(setHealthEntry).toHaveBeenCalledWith("2026-07-20", { hydration: 4 });
  });

  it("routes a performance write to setPerformanceEntry", () => {
    const { result } = renderHook(() => useMetricWriter());
    result.current.setMetricValue(tracked("scores", "performance"), "2026-07-20", 10);
    expect(setPerformanceEntry).toHaveBeenCalledWith("2026-07-20", { metrics: { scores: 10 } });
  });

  it("passes undefined through for deletes", () => {
    const { result } = renderHook(() => useMetricWriter());
    result.current.setMetricValue(tracked("mood", "health"), "2026-07-20", undefined);
    expect(setHealthEntry).toHaveBeenCalledWith("2026-07-20", { customMetrics: { mood: undefined } });
  });
});
