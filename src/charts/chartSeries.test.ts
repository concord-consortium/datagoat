import { describe, it, expect } from "vitest";
import {
  lookupGoalLine,
  buildAlignedSeries,
  computeAverage,
} from "./chartSeries";
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

  it("returns the per-profile goal for performance metrics that have one", () => {
    expect(lookupGoalLine("goals", "Male/Strength and Power")).toBe(1);
    expect(lookupGoalLine("assists", "Female/Endurance")).toBe(2);
    expect(lookupGoalLine("yards", "Male/Endurance")).toBe(50);
    expect(lookupGoalLine("tackles", "Female/Strength and Power")).toBe(5);
  });

  it("returns undefined for performance metrics intentionally without a goal", () => {
    expect(lookupGoalLine("wins", "Male/Strength and Power")).toBeUndefined();
    expect(lookupGoalLine("losses", "Female/Endurance")).toBeUndefined();
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

  it("reads wellness custom-metric values from entry.customMetrics", () => {
    // Custom wellness ids fall through readWellnessMetric's switch to
    // a customMetrics lookup. Without that branch (the bug Copilot
    // flagged), the chart series would be all-null for any wellness
    // custom metric.
    const e0 = {
      ...emptyWellnessEntry(isoAtDaysAgo(1)),
      customMetrics: { c_stretch: 30 },
    };
    const e1 = {
      ...emptyWellnessEntry(isoAtDaysAgo(0)),
      customMetrics: { c_stretch: 45 },
    };
    const out = buildAlignedSeries({
      type: "wellness",
      metricId: "c_stretch",
      wellnessEntries: [e0, e1],
      performanceEntries: [],
      rangeDays: 3,
    });
    expect(out[1].value).toBe(30);
    expect(out[2].value).toBe(45);
  });

  it("treats wellness custom value 0 as 'not logged' (matches the blank-input convention)", () => {
    const entry = {
      ...emptyWellnessEntry(isoAtDaysAgo(0)),
      customMetrics: { c_stretch: 0 },
    };
    const out = buildAlignedSeries({
      type: "wellness",
      metricId: "c_stretch",
      wellnessEntries: [entry],
      performanceEntries: [],
      rangeDays: 1,
    });
    expect(out[0].value).toBeNull();
  });

  it("flows negative wellness custom values through unchanged", () => {
    // Customs with `yBottomRaw < 0` (e.g. a score-differential
    // metric) need negative values to reach the chart. The
    // readWellnessMetric branch uses `!== 0` rather than `> 0`.
    const entry = {
      ...emptyWellnessEntry(isoAtDaysAgo(0)),
      customMetrics: { c_diff: -3 },
    };
    const out = buildAlignedSeries({
      type: "wellness",
      metricId: "c_diff",
      wellnessEntries: [entry],
      performanceEntries: [],
      rangeDays: 1,
    });
    expect(out[0].value).toBe(-3);
  });
});

describe("computeAverage", () => {
  const sample = [
    { value: 1 },
    { value: null },
    { value: 3 },
    { value: 5 },
  ];

  it("filters nulls by default — averages only the days with data", () => {
    expect(computeAverage(sample)).toBe((1 + 3 + 5) / 3);
  });

  it("returns undefined when there are no filled values (default mode)", () => {
    expect(computeAverage([{ value: null }, { value: null }])).toBeUndefined();
    expect(computeAverage([])).toBeUndefined();
  });

  it("treats nulls as 0 when nullsCountAsZero is true", () => {
    // (1 + 0 + 3 + 5) / 4 = 2.25
    expect(
      computeAverage(sample, { nullsCountAsZero: true }),
    ).toBe((1 + 0 + 3 + 5) / 4);
  });

  it("returns undefined for an empty series even with nullsCountAsZero", () => {
    expect(computeAverage([], { nullsCountAsZero: true })).toBeUndefined();
  });

  it("returns 0 when every value is null and nullsCountAsZero is true", () => {
    expect(
      computeAverage([{ value: null }, { value: null }], {
        nullsCountAsZero: true,
      }),
    ).toBe(0);
  });
});
