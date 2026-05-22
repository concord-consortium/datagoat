import { describe, it, expect } from "vitest";
import { goalDeterminationText, resolveGoalText } from "./metricGoals";

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

describe("goalDeterminationText", () => {
  it("renders the DataGoat guidance with 'an' before a vowel-initial athlete type", () => {
    expect(goalDeterminationText("Endurance", "Lean Mass")).toBe(
      "As an Endurance athlete, your Lean Mass target should be tailored " +
        "to your sport-specific demands, performance goals, and individual " +
        "health. Look at your current numbers and discuss your goals with " +
        "a trusted support staff member (for example: dietician, strength " +
        "and conditioning coach, sports medicine) to enter an appropriate " +
        "goal.",
    );
  });

  it("uses 'a' before a consonant-initial athlete type", () => {
    expect(goalDeterminationText("Strength and Power", "Lean Mass")).toMatch(
      /^As a Strength and Power athlete, your Lean Mass target/,
    );
  });

  it("substitutes the metric name verbatim so acronyms keep their casing", () => {
    expect(goalDeterminationText("Endurance", "VO2 Max")).toContain(
      "your VO2 Max target",
    );
  });
});
