import { describe, it, expect } from "vitest";
import {
  PROFILE_VARIANTS,
  PROFILE_CHART_GOALS,
  DEFAULT_PROFILE_KEY,
} from "./profileVariants";

const EXPECTED_KEYS = [
  "Male/Strength and Power",
  "Male/Endurance",
  "Female/Strength and Power",
  "Female/Endurance",
  "Non-binary/Strength and Power",
  "Non-binary/Endurance",
  "Unspecified/Strength and Power",
  "Unspecified/Endurance",
];

describe("PROFILE_VARIANTS", () => {
  it("has the default profile key", () => {
    expect(PROFILE_VARIANTS[DEFAULT_PROFILE_KEY]).toBeDefined();
  });

  it.each(EXPECTED_KEYS)("resolves variant for %s", (key) => {
    const v = PROFILE_VARIANTS[key];
    expect(v).toBeDefined();
    expect(v).not.toBeNull();
  });

  it.each(EXPECTED_KEYS)("resolves chart goals for %s", (key) => {
    const g = PROFILE_CHART_GOALS[key];
    expect(g).toBeDefined();
    expect(g.sleepEffGoal).toBeGreaterThan(0);
  });
});
