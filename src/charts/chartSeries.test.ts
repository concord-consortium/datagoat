import { describe, it, expect } from "vitest";
import { lookupGoalLine, buildAlignedSeries } from "./chartSeries";
import { emptyWellnessEntry, type WellnessEntry } from "../types/data";
import { isoAtDaysAgo } from "../utils/dates";

describe("lookupGoalLine", () => {
  it("returns the per-profile goal for sleepEfficiency", () => {
    expect(lookupGoalLine("sleepEfficiency", "Male/Strength and Power")).toBe(
      75
    );
    expect(lookupGoalLine("sleepEfficiency", "Female/Endurance")).toBe(75);
    expect(lookupGoalLine("sleepEfficiency", "Male/Endurance")).toBe(80);
  });

  it("falls back to the static config goal for hydration", () => {
    expect(lookupGoalLine("hydration", "Male/Strength and Power")).toBe(3);
    expect(lookupGoalLine("hydration", "Female/Endurance")).toBe(3);
  });

  it("returns undefined for metrics with neither profile nor config goal", () => {
    expect(lookupGoalLine("goals", "Male/Strength and Power")).toBeUndefined();
  });
});

describe("buildAlignedSeries", () => {
  function makeWellnessEntry(daysAgo: number, hydration: number): WellnessEntry {
    return {
      ...emptyWellnessEntry(isoAtDaysAgo(daysAgo)),
      hydration,
    };
  }

  it("emits one entry per day in the range, oldest first, today last", () => {
    const out = buildAlignedSeries({
      type: "wellness",
      metricId: "hydration",
      wellnessEntries: [],
      performanceEntries: [],
      rangeDays: 7,
    });
    expect(out).toHaveLength(7);
    expect(out[0].date).toBe(isoAtDaysAgo(6));
    expect(out[6].date).toBe(isoAtDaysAgo(0));
  });

  it("returns null for days without an entry", () => {
    const out = buildAlignedSeries({
      type: "wellness",
      metricId: "hydration",
      wellnessEntries: [],
      performanceEntries: [],
      rangeDays: 7,
    });
    expect(out.every((d) => d.value === null)).toBe(true);
  });

  it("populates values from wellness entries and leaves other days null", () => {
    const out = buildAlignedSeries({
      type: "wellness",
      metricId: "hydration",
      wellnessEntries: [makeWellnessEntry(2, 3), makeWellnessEntry(0, 5)],
      performanceEntries: [],
      rangeDays: 7,
    });
    expect(out[4].value).toBe(3); // 2 days ago at index (rangeDays - 1) - 2 = 4
    expect(out[5].value).toBeNull();
    expect(out[6].value).toBe(5);
    expect(out.slice(0, 4).every((d) => d.value === null)).toBe(true);
  });

  it("treats hydration value 0 as 'not logged' (consistent with buildSeries semantics)", () => {
    const out = buildAlignedSeries({
      type: "wellness",
      metricId: "hydration",
      wellnessEntries: [makeWellnessEntry(1, 0), makeWellnessEntry(0, 4)],
      performanceEntries: [],
      rangeDays: 3,
    });
    expect(out[1].value).toBeNull(); // 0 → "not logged" → null
    expect(out[2].value).toBe(4);
  });

  it("preserves zero values for performance metrics (0 is a valid score)", () => {
    const out = buildAlignedSeries({
      type: "performance",
      metricId: "goals",
      wellnessEntries: [],
      performanceEntries: [
        { date: isoAtDaysAgo(1), metrics: { goals: 0 } },
        { date: isoAtDaysAgo(0), metrics: { goals: 2 } },
      ] as any,
      rangeDays: 3,
    });
    expect(out[1].value).toBe(0);
    expect(out[2].value).toBe(2);
  });
});
