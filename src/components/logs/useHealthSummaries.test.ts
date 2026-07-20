// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHealthSummaries } from "./useHealthSummaries";
import { DEFAULT_PROFILE_KEY } from "../../data/profileVariants";
import type { HealthEntry } from "../../types/data";

describe("useHealthSummaries", () => {
  it("returns an empty summary for an untracked id", () => {
    const { result } = renderHook(() =>
      useHealthSummaries(["hydration"], [], DEFAULT_PROFILE_KEY),
    );
    expect(result.current("not-tracked")).toEqual({
      sparklineData: undefined,
      sparklineGoal: undefined,
      avgLabel: undefined,
    });
  });

  it("returns sparkline data for a tracked id", () => {
    const { result } = renderHook(() =>
      useHealthSummaries(["hydration"], [] as HealthEntry[], DEFAULT_PROFILE_KEY),
    );
    const summary = result.current("hydration");
    // buildAlignedSeries pads the 7-day window even with no entries.
    expect(summary.sparklineData).toHaveLength(7);
  });

  it("formats an average from logged entries", () => {
    const entries = [
      { version: 1, date: todayIso(), hydration: 4, availability: {} },
    ] as HealthEntry[];
    const { result } = renderHook(() =>
      useHealthSummaries(["hydration"], entries, DEFAULT_PROFILE_KEY),
    );
    expect(result.current("hydration").avgLabel).toBeTruthy();
  });
});

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
