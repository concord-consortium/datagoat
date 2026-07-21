import { describe, it, expect } from "vitest";
import {
  getMetricValue,
  isMetricFilled,
  resolveStorage,
  resolveWrite,
  scalarFilled,
} from "./metricAccessor";
import type { TrackedMetric } from "../components/logs/useTrackedMetrics";
import type { CompetitionEntry, HealthEntry, PerformanceEntry } from "../types/data";

function tracked(id: string, type: TrackedMetric["type"]): TrackedMetric {
  return { id, name: id, type, section: "daily" };
}

function health(patch: Partial<HealthEntry> = {}): HealthEntry {
  return { version: 1, date: "2026-07-20", availability: {}, ...patch };
}
function perf(metrics: PerformanceEntry["metrics"] = {}): PerformanceEntry {
  return { version: 1, date: "2026-07-20", metrics };
}
function comp(metrics: CompetitionEntry["metrics"] = {}): CompetitionEntry {
  return { version: 1, date: "2026-07-20", metrics };
}

describe("resolveStorage", () => {
  it("routes the five named health built-ins to their named field", () => {
    expect(resolveStorage(tracked("hydration", "health"))).toEqual({
      kind: "healthNamed",
      field: "hydration",
    });
    expect(resolveStorage(tracked("leanMass", "health"))).toEqual({
      kind: "healthNamed",
      field: "leanMass",
    });
  });

  it("routes any other health metric to the customMetrics map", () => {
    expect(resolveStorage(tracked("mood", "health"))).toEqual({ kind: "healthCustom" });
    expect(resolveStorage(tracked("myCustom", "health"))).toEqual({ kind: "healthCustom" });
  });

  it("routes performance and competition metrics to the map", () => {
    expect(resolveStorage(tracked("scores", "performance"))).toEqual({ kind: "map" });
    expect(resolveStorage(tracked("winningPercentage", "competition"))).toEqual({ kind: "map" });
  });
});

describe("getMetricValue", () => {
  it("reads a named health field", () => {
    expect(getMetricValue(tracked("hydration", "health"), health({ hydration: 4 }))).toBe(4);
  });
  it("reads a health custom from customMetrics", () => {
    expect(
      getMetricValue(tracked("mood", "health"), health({ customMetrics: { mood: 2 } })),
    ).toBe(2);
  });
  it("reads a perf/comp value from the metrics map", () => {
    expect(getMetricValue(tracked("scores", "performance"), perf({ scores: 10 }))).toBe(10);
    expect(getMetricValue(tracked("goals", "competition"), comp({ goals: "hat trick" }))).toBe(
      "hat trick",
    );
  });
  it("returns undefined for an unset value", () => {
    expect(getMetricValue(tracked("hydration", "health"), health())).toBeUndefined();
    expect(getMetricValue(tracked("scores", "performance"), perf())).toBeUndefined();
  });
});

describe("scalarFilled", () => {
  it("counts finite numbers including 0 as filled", () => {
    expect(scalarFilled(0)).toBe(true);
    expect(scalarFilled(-3)).toBe(true);
  });
  it("does not count NaN or undefined", () => {
    expect(scalarFilled(Number.NaN)).toBe(false);
    expect(scalarFilled(undefined)).toBe(false);
  });
  it("counts non-empty trimmed strings only", () => {
    expect(scalarFilled("x")).toBe(true);
    expect(scalarFilled("   ")).toBe(false);
    expect(scalarFilled("")).toBe(false);
  });
});

describe("isMetricFilled", () => {
  it("delegates health availability to the tree check", () => {
    const t = tracked("availability", "health");
    expect(isMetricFilled(t, health({ availability: {} }))).toBe(false);
    expect(
      isMetricFilled(
        t,
        health({ availability: { practiceHeld: false, gameHeld: false } }),
      ),
    ).toBe(true);
  });

  it("uses scalarFilled for every other metric", () => {
    expect(isMetricFilled(tracked("hydration", "health"), health({ hydration: 0 }))).toBe(true);
    expect(isMetricFilled(tracked("hydration", "health"), health())).toBe(false);
    expect(isMetricFilled(tracked("scores", "performance"), perf({ scores: 12 }))).toBe(true);
    expect(isMetricFilled(tracked("scores", "performance"), perf({ scores: "" }))).toBe(false);
  });
});

describe("resolveWrite", () => {
  it("writes a named health field", () => {
    expect(resolveWrite(tracked("hydration", "health"), 4)).toEqual({
      slice: "health",
      partial: { hydration: 4 },
    });
  });
  it("writes a health custom under customMetrics", () => {
    expect(resolveWrite(tracked("mood", "health"), 2)).toEqual({
      slice: "health",
      partial: { customMetrics: { mood: 2 } },
    });
  });
  it("writes perf/comp under the metrics map", () => {
    expect(resolveWrite(tracked("scores", "performance"), 10)).toEqual({
      slice: "performance",
      partial: { metrics: { scores: 10 } },
    });
    expect(resolveWrite(tracked("goals", "competition"), 3)).toEqual({
      slice: "competition",
      partial: { metrics: { goals: 3 } },
    });
  });
  it("preserves undefined so the delete sentinel fires downstream", () => {
    expect(resolveWrite(tracked("mood", "health"), undefined)).toEqual({
      slice: "health",
      partial: { customMetrics: { mood: undefined } },
    });
    expect(resolveWrite(tracked("scores", "performance"), undefined)).toEqual({
      slice: "performance",
      partial: { metrics: { scores: undefined } },
    });
  });

  it("coerces a string away from a numeric named health field", () => {
    expect(resolveWrite(tracked("hydration", "health"), "oops")).toEqual({
      slice: "health",
      partial: { hydration: undefined },
    });
  });
});
