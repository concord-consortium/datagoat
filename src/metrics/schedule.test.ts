// @vitest-environment node
import { describe, it, expect } from "vitest";
import { HEALTH_METRICS } from "./healthMetrics";
import { ADDABLE_HEALTH, ADDABLE_PERFORMANCE } from "./addableMetrics";
import { COMPETITION_METRICS } from "./competitionMetrics";
import { resolveSchedule } from "../types/metricSchedule";
import type { MetricDefinition } from "./types";

function byId(list: MetricDefinition[], id: string): MetricDefinition {
  const found = list.find((m) => m.id === id);
  if (!found) throw new Error(`metric ${id} not found`);
  return found;
}

describe("built-in metric schedules", () => {
  it("marks ordinary health metrics daily", () => {
    // mood was removed as a choice (DGT-87); hydration / sleepTime / protein remain daily.
    for (const id of ["hydration", "sleepTime", "protein"]) {
      expect(resolveSchedule(byId(HEALTH_METRICS, id).schedule)).toEqual({
        period: "daily",
      });
    }
  });

  it("schedules Lean Mass yearly (its ~2-3x/year cadence), not daily", () => {
    expect(resolveSchedule(byId(HEALTH_METRICS, "leanMass").schedule)).toEqual({
      period: "yearly",
      count: 2,
    });
  });

  it("marks addable health metrics daily", () => {
    // hrv was removed as a choice (DGT-87); perceivedExertion remains a daily addable.
    expect(resolveSchedule(byId(ADDABLE_HEALTH, "perceivedExertion").schedule)).toEqual({
      period: "daily",
    });
  });

  it("schedules quarterly performance field tests as yearly x4", () => {
    // oneMileRun was removed as a choice (DGT-87); fortyYardDash / beepTest remain quarterly.
    for (const id of ["fortyYardDash", "beepTest"]) {
      expect(
        resolveSchedule(byId(ADDABLE_PERFORMANCE, id).schedule),
      ).toEqual({ period: "yearly", count: 4 });
    }
  });

  it("leaves cadence-less performance metrics irregular", () => {
    expect(
      resolveSchedule(byId(ADDABLE_PERFORMANCE, "oneRepMaxBench").schedule),
    ).toEqual({ period: "irregular" });
  });

  it("leaves event-driven competition metrics irregular", () => {
    expect(
      resolveSchedule(byId(COMPETITION_METRICS, "scores").schedule),
    ).toEqual({ period: "irregular" });
  });
});
