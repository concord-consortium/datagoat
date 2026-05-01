import { describe, it, expect } from "vitest";
import { getCompTermLabel, getCompTermLowerLabel } from "./competitionTerms";

describe("getCompTermLabel", () => {
  it("returns 'Game' for an empty string", () => {
    expect(getCompTermLabel("")).toBe("Game");
  });

  it("abbreviates 'tournament' to 'Tourn.' when abbreviated=true", () => {
    expect(getCompTermLabel("tournament", true)).toBe("Tourn.");
  });

  it("returns the full 'Tournament' label when abbreviated=false", () => {
    expect(getCompTermLabel("tournament")).toBe("Tournament");
  });

  it("title-cases an unknown term as a passthrough", () => {
    expect(getCompTermLabel("curling")).toBe("Curling");
  });

  it("normalizes mixed-case input via the fallback map", () => {
    expect(getCompTermLabel("MEET")).toBe("Meet");
  });
});

describe("getCompTermLowerLabel", () => {
  it("returns 'game' for an empty string", () => {
    expect(getCompTermLowerLabel("")).toBe("game");
  });

  it("lowercases a title-case term", () => {
    expect(getCompTermLowerLabel("Tournament")).toBe("tournament");
  });

  it("lowercases all-caps input", () => {
    expect(getCompTermLowerLabel("MEET")).toBe("meet");
  });
});
