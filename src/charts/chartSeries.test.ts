import { describe, it, expect } from "vitest";
import { lookupGoalLine } from "./chartSeries";

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
