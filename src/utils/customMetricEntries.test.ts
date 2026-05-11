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

  it("ignores zero values (treats them as absent)", () => {
    // Zero is the codebase's sentinel for "blank input" — the health
    // and competition log write 0 when the user leaves a numeric input
    // empty. Treating 0 as "logged" would flag every metric the user
    // ever interacted with.
    const w = emptyHealthEntry("2026-05-01");
    w.customMetrics = { c_xyz: 0 };
    expect(hasEntriesForMetric("c_xyz", [w], [])).toBe(false);
  });
});
