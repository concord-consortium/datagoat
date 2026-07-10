import { describe, it, expect } from "vitest";
import {
  DEMO_DAYS,
  generateDemoCompetitionEntries,
  generateDemoHealthEntries,
  generateDemoPerformanceEntries,
} from "./demoEntries";
import { buildDataset, resolveTrackedMetrics } from "./codapExport";
import { ADDABLE_PERFORMANCE } from "../metrics/addableMetrics";
import { COMPETITION_METRICS } from "../metrics/competitionMetrics";

// Local copy of the plugin's readBagField accessor (a private helper in
// CodapPlugin.tsx, not exported) so the test exercises the same demo ->
// export path the plugin uses.
function readBag(
  e: { metrics?: Record<string, number | string | undefined> },
  id: string,
): string | number | null {
  const v = e.metrics?.[id];
  return typeof v === "number" || typeof v === "string" ? v : null;
}

describe("demoEntries", () => {
  it("generates the requested number of daily entries with ISO dates", () => {
    const health = generateDemoHealthEntries(7, 12345);
    expect(health).toHaveLength(7);
    for (const e of health) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Dates are strictly increasing (oldest first).
    const dates = health.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("defaults to DEMO_DAYS entries", () => {
    expect(generateDemoPerformanceEntries()).toHaveLength(DEMO_DAYS);
    expect(DEMO_DAYS).toBe(30);
  });

  it("is deterministic for a fixed seed", () => {
    expect(generateDemoHealthEntries(10, 777)).toEqual(
      generateDemoHealthEntries(10, 777),
    );
  });

  it("puts the 5 numeric health metrics in typed fields and generates an availability tree", () => {
    // Large day count so the ~20% null rate almost surely leaves at least
    // one populated value per field across the run.
    const entries = generateDemoHealthEntries(200, 42);
    const hasNumber = (k: "hydration" | "sleepTime" | "protein") =>
      entries.some((e) => typeof e[k] === "number");
    expect(hasNumber("hydration")).toBe(true);
    expect(hasNumber("sleepTime")).toBe(true);
    expect(hasNumber("protein")).toBe(true);
    // Availability is a tree object, never a bare number.
    const answered = entries.filter(
      (e) => Object.keys(e.availability).length > 0,
    );
    expect(answered.length).toBeGreaterThan(0);
    for (const e of answered) {
      expect(typeof e.availability.practiceHeld === "boolean" ||
        typeof e.availability.gameHeld === "boolean").toBe(true);
    }
    // mood is not a typed field: it lands in the customMetrics bag.
    expect(
      entries.some((e) => typeof e.customMetrics?.mood === "number"),
    ).toBe(true);
  });

  it("performance/competition values land in the metrics bag and export to rows", () => {
    const perf = generateDemoPerformanceEntries(30, 5);
    const metrics = resolveTrackedMetrics(
      ADDABLE_PERFORMANCE.map((m) => m.id),
      ADDABLE_PERFORMANCE,
      [],
    );
    const { attributes, rows } = buildDataset(metrics, perf, readBag);
    expect(attributes[0]).toEqual({ name: "date", type: "date" });
    expect(rows).toHaveLength(30);
    // At least one non-null, non-date cell somewhere in the table.
    const populated = rows.some((row) =>
      Object.entries(row).some(([k, v]) => k !== "date" && v != null),
    );
    expect(populated).toBe(true);

    const comp = generateDemoCompetitionEntries(30, 5);
    const compMetrics = resolveTrackedMetrics(
      COMPETITION_METRICS.map((m) => m.id),
      COMPETITION_METRICS,
      [],
    );
    const compResult = buildDataset(compMetrics, comp, readBag);
    expect(compResult.rows).toHaveLength(30);
  });
});
