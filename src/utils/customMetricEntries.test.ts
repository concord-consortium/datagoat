import { describe, expect, it } from "vitest";
import { hasEntriesForMetric } from "./customMetricEntries";
import type { HealthEntry, CompetitionEntry } from "../types/data";
import { emptyHealthEntry, emptyCompetitionEntry } from "../types/data";

describe("hasEntriesForMetric", () => {
  it("returns false when no entries reference the metric", () => {
    const health: HealthEntry[] = [emptyHealthEntry("2026-05-01")];
    const competition: CompetitionEntry[] = [
      emptyCompetitionEntry("2026-05-01"),
    ];
    expect(hasEntriesForMetric("c_xyz", health, competition)).toBe(false);
  });

  it("returns true when a health entry has a value for the metric", () => {
    const w = emptyHealthEntry("2026-05-01");
    w.customMetrics = { c_xyz: 5 };
    expect(hasEntriesForMetric("c_xyz", [w], [])).toBe(true);
  });

  it("returns true when a competition entry has a value for the metric", () => {
    const p = emptyCompetitionEntry("2026-05-01");
    p.metrics = { c_xyz: 5 };
    expect(hasEntriesForMetric("c_xyz", [], [p])).toBe(true);
  });

  it("considers a 0 value meaningful (DGT-53)", () => {
    const h: HealthEntry[] = [
      {
        ...emptyHealthEntry("2026-05-11"),
        customMetrics: { c_stretch: 0 },
      },
    ];
    expect(hasEntriesForMetric("c_stretch", h, [])).toBe(true);
  });

  it("ignores an undefined / missing custom metric key (DGT-53)", () => {
    const h: HealthEntry[] = [emptyHealthEntry("2026-05-11")];
    expect(hasEntriesForMetric("c_stretch", h, [])).toBe(false);
  });
});
