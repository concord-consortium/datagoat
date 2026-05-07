import { describe, it, expect } from "vitest";
import { getChipState } from "./wellnessCompleteness";
import type { WellnessEntry } from "../types/data";

const TRACKED_DEFAULT = [
  "hydration",
  "sleepTime",
  "sleepEfficiency",
  "protein",
  "leanMass",
  "availability",
];

function emptyEntry(): WellnessEntry {
  return {
    version: 1,
    date: "2026-04-28",
    hydration: 0,
    sleepTime: 0,
    sleepEfficiency: 0,
    protein: 0,
    leanMass: 0,
    availability: {
      practiceHeld: null,
      practiceParticipation: null,
      gameHeld: null,
      gameParticipation: null,
    },
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

  it("availability null + one numeric tracked field => 'some'", () => {
    const entry = emptyEntry();
    entry.hydration = 4;
    expect(getChipState(entry, ["hydration", "availability"])).toBe("some");
  });

  it("availability null alone (only metric tracked) => 'none'", () => {
    expect(getChipState(emptyEntry(), ["availability"])).toBe("none");
  });

  it("availability practiceHeld=true without participation does NOT count as filled", () => {
    const entry = emptyEntry();
    entry.availability.practiceHeld = true;
    entry.availability.practiceParticipation = null;
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
    entry.availability.practiceParticipation = "played";
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
    entry.availability.practiceParticipation = "played";
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
});
