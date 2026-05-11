import { describe, it, expect } from "vitest";
import { getChipState } from "./healthCompleteness";
import type { HealthEntry } from "../types/data";

const TRACKED_DEFAULT = [
  "hydration",
  "sleepTime",
  "sleepEfficiency",
  "protein",
  "leanMass",
  "availability",
];

function emptyEntry(): HealthEntry {
  return {
    version: 1,
    date: "2026-04-28",
    availability: {},
  };
}

describe("getChipState", () => {
  it("returns 'none' for a null entry", () => {
    expect(getChipState(null, TRACKED_DEFAULT)).toBe("none");
  });

  it("returns 'none' when no tracked metrics are configured", () => {
    expect(getChipState(emptyEntry(), [])).toBe("none");
  });

  it("returns 'none' when no field is filled", () => {
    expect(getChipState(emptyEntry(), TRACKED_DEFAULT)).toBe("none");
  });

  it("returns 'some' when at least one numeric field is filled", () => {
    const entry = emptyEntry();
    entry.hydration = 4;
    expect(getChipState(entry, TRACKED_DEFAULT)).toBe("some");
  });

  it("availability unanswered + one numeric tracked field => 'some'", () => {
    const entry = emptyEntry();
    entry.hydration = 4;
    expect(getChipState(entry, ["hydration", "availability"])).toBe("some");
  });

  it("availability unanswered alone (only metric tracked) => 'none'", () => {
    expect(getChipState(emptyEntry(), ["availability"])).toBe("none");
  });

  it("availability practiceHeld=true without participation does NOT count as filled", () => {
    const entry = emptyEntry();
    entry.availability.practiceHeld = true;
    // practiceParticipation intentionally absent (undefined) - not answered
    entry.availability.gameHeld = false;
    expect(getChipState(entry, ["availability"])).toBe("none");
  });

  it("availability with both held=false counts as filled (the tree is answered)", () => {
    const entry = emptyEntry();
    entry.availability.practiceHeld = false;
    entry.availability.gameHeld = false;
    expect(getChipState(entry, ["availability"])).toBe("all");
  });

  it("availability with held=true + participation set counts as filled", () => {
    const entry = emptyEntry();
    entry.availability.practiceHeld = true;
    entry.availability.practiceParticipation = true; // played
    entry.availability.gameHeld = false;
    expect(getChipState(entry, ["availability"])).toBe("all");
  });

  it("returns 'all' when every tracked metric is filled", () => {
    const entry = emptyEntry();
    entry.hydration = 4;
    entry.sleepTime = 8;
    entry.sleepEfficiency = 85;
    entry.protein = 1.5;
    entry.leanMass = 60;
    entry.availability.practiceHeld = true;
    entry.availability.practiceParticipation = true; // played
    entry.availability.gameHeld = false;
    expect(getChipState(entry, TRACKED_DEFAULT)).toBe("all");
  });

  it("only counts tracked metrics - untracked filled fields are ignored", () => {
    const entry = emptyEntry();
    entry.hydration = 4;
    entry.sleepTime = 8;
    // only "hydration" is tracked; sleep is filled but not in the list.
    expect(getChipState(entry, ["hydration"])).toBe("all");
  });

  it("counts a tracked custom metric with a non-zero number as filled", () => {
    // Regression: isFieldFilled() used to treat unknown ids as
    // not-filled, which meant tracking any custom health metric blocked
    // the chip from ever reaching "all". The default branch now reads
    // from entry.customMetrics.
    const entry = emptyEntry();
    entry.hydration = 4;
    entry.customMetrics = { c_caffeine: 200 };
    expect(getChipState(entry, ["hydration", "c_caffeine"])).toBe("all");
  });

  it("counts a tracked custom metric with a non-zero NEGATIVE value as filled", () => {
    // Custom metrics with yBottomRaw < 0 can legitimately log negative
    // values (e.g. weight change). The customs fallback uses !== 0 so
    // those count, matching the Dashboard.competitionLoggedAny rule.
    const entry = emptyEntry();
    entry.customMetrics = { c_weight_change: -2 };
    expect(getChipState(entry, ["c_weight_change"])).toBe("all");
  });

  it("counts a tracked custom metric with a zero value as filled", () => {
    // Zero now counts as a valid logged value (DGT-53), matching
    // the built-in metrics behavior.
    const entry = emptyEntry();
    entry.customMetrics = { c_caffeine: 0 };
    expect(getChipState(entry, ["c_caffeine"])).toBe("all");
  });

  it("counts a tracked custom metric absent from customMetrics as NOT filled", () => {
    const entry = emptyEntry();
    // customMetrics undefined; tracked id has no entry yet.
    expect(getChipState(entry, ["c_caffeine"])).toBe("none");
  });

  it("counts a built-in field of 0 as filled (DGT-53)", () => {
    const entry = emptyEntry();
    entry.sleepTime = 0;
    expect(getChipState(entry, ["sleepTime"])).toBe("all");
  });

  it("treats an undefined built-in field as 'not logged' (DGT-53)", () => {
    const entry: HealthEntry = {
      version: 1,
      date: "2026-04-28",
      availability: {},
    };
    expect(getChipState(entry, ["sleepTime"])).toBe("none");
  });
});
