import { describe, expect, it } from "vitest";
import { hasEntriesForMetric } from "./customMetricEntries";
import type { WellnessEntry, PerformanceEntry } from "../types/data";
import { emptyWellnessEntry, emptyPerformanceEntry } from "../types/data";

describe("hasEntriesForMetric", () => {
  it("returns false when no entries reference the metric", () => {
    const wellness: WellnessEntry[] = [emptyWellnessEntry("2026-05-01")];
    const performance: PerformanceEntry[] = [
      emptyPerformanceEntry("2026-05-01"),
    ];
    expect(hasEntriesForMetric("c_xyz", wellness, performance)).toBe(false);
  });

  it("returns true when a wellness entry has a value for the metric", () => {
    const w = emptyWellnessEntry("2026-05-01");
    w.customMetrics = { c_xyz: 5 };
    expect(hasEntriesForMetric("c_xyz", [w], [])).toBe(true);
  });

  it("returns true when a performance entry has a value for the metric", () => {
    const p = emptyPerformanceEntry("2026-05-01");
    p.metrics = { c_xyz: 5 };
    expect(hasEntriesForMetric("c_xyz", [], [p])).toBe(true);
  });

  it("ignores zero values (treats them as absent)", () => {
    // Zero is the codebase's sentinel for "blank input" — the wellness
    // and performance log write 0 when the user leaves a numeric input
    // empty. Treating 0 as "logged" would flag every metric the user
    // ever interacted with.
    const w = emptyWellnessEntry("2026-05-01");
    w.customMetrics = { c_xyz: 0 };
    expect(hasEntriesForMetric("c_xyz", [w], [])).toBe(false);
  });
});
