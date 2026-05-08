import { describe, it, expect } from "vitest";
import { generateDemoSeries } from "./useChartSeries";
import { isoAtDaysAgo } from "../utils/dates";

describe("generateDemoSeries", () => {
  it("emits one entry per day in the range, oldest first, today last", () => {
    const out = generateDemoSeries("hydration", 7);
    expect(out).toHaveLength(7);
    expect(out[0].date).toBe(isoAtDaysAgo(6));
    expect(out[6].date).toBe(isoAtDaysAgo(0));
  });

  it("is deterministic — same metric+range always produces the same series", () => {
    const a = generateDemoSeries("hydration", 7);
    const b = generateDemoSeries("hydration", 7);
    expect(a).toEqual(b);
  });

  it("produces different sequences for different metrics", () => {
    const hydration = generateDemoSeries("hydration", 7);
    const sleep = generateDemoSeries("sleepEfficiency", 7);
    expect(hydration).not.toEqual(sleep);
  });

  it("keeps a given day's value stable when range expands", () => {
    // Switching from 7d to 30d should not change the values for the
    // overlapping days — they're seeded per (metricId, dayOffset).
    const seven = generateDemoSeries("hydration", 7);
    const thirty = generateDemoSeries("hydration", 30);
    // 7d's index 6 (= today, dayOffset 0) maps to 30d's index 29.
    expect(thirty[29].date).toBe(seven[6].date);
    expect(thirty[29].value).toBe(seven[6].value);
    // 7d's index 0 (= 6 days ago) maps to 30d's index 23.
    expect(thirty[23].date).toBe(seven[0].date);
    expect(thirty[23].value).toBe(seven[0].value);
  });

  it("produces hydration values in the metric's random range or null", () => {
    const out = generateDemoSeries("hydration", 30);
    for (const d of out) {
      if (d.value === null) continue;
      expect(Number.isInteger(d.value)).toBe(true);
      expect(d.value).toBeGreaterThanOrEqual(1);
      expect(d.value).toBeLessThanOrEqual(5);
    }
  });

  it("produces sleepTime values as floats with one decimal in 6..10", () => {
    const out = generateDemoSeries("sleepTime", 30);
    for (const d of out) {
      if (d.value === null) continue;
      expect(Math.round(d.value * 10)).toBe(d.value * 10);
      expect(d.value).toBeGreaterThanOrEqual(6);
      expect(d.value).toBeLessThanOrEqual(10);
    }
  });

  it("includes some null values across a 90-day range (~20% null rate)", () => {
    const out = generateDemoSeries("hydration", 90);
    const nulls = out.filter((d) => d.value === null).length;
    // Bands around the expected ~18 nulls; loose so the test isn't flaky
    // if the rate is tweaked slightly later.
    expect(nulls).toBeGreaterThan(5);
    expect(nulls).toBeLessThan(40);
  });
});
