import { describe, it, expect } from "vitest";
import { resolveGoalText } from "./metricGoals";

describe("resolveGoalText", () => {
  it("substitutes {compTermPlural} into the availability template", () => {
    expect(resolveGoalText("availability", "Male/Endurance", "matches")).toBe(
      "to be available for more than 80% of your practices and matches",
    );
  });

  it("falls back to 'games' when compTermPlural is omitted", () => {
    expect(resolveGoalText("availability", "Male/Endurance")).toBe(
      "to be available for more than 80% of your practices and games",
    );
  });

  it("returns static goal text unchanged for metrics with no placeholder", () => {
    expect(resolveGoalText("sleepTime", "Female/Strength and Power")).toBe(
      "to get 7-9 hours of sleep every night",
    );
  });

  it("returns the mapped string for a known profile key", () => {
    expect(resolveGoalText("sleepEfficiency", "Male/Strength and Power")).toBe(
      "to aim for 75-95% sleep efficiency",
    );
  });

  it("renders the literal '[n]' placeholder for an unknown profile key", () => {
    expect(resolveGoalText("sleepEfficiency", "Non-binary/Endurance")).toBe("[n]");
  });

  it("returns null for a metric id with no goal mapping", () => {
    expect(resolveGoalText("restingHeartRate", "Male/Endurance")).toBeNull();
  });
});
