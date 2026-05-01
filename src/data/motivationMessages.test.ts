import { describe, it, expect } from "vitest";
import { MOTIVATION_MESSAGES } from "./motivationMessages";
import { ICONS } from "../components/dashboard/MotivationMessage";

describe("MOTIVATION_MESSAGES", () => {
  it("has 7 entries", () => {
    expect(MOTIVATION_MESSAGES).toHaveLength(7);
  });

  it("has exactly one null-icon entry, at index 1", () => {
    const nullIndices = MOTIVATION_MESSAGES
      .map((m, i) => (m.iconKey === null ? i : -1))
      .filter((i) => i >= 0);
    expect(nullIndices).toEqual([1]);
  });

  it("has unique non-null iconKeys", () => {
    const nonNull = MOTIVATION_MESSAGES
      .map((m) => m.iconKey)
      .filter((k): k is Exclude<typeof k, null> => k !== null);
    expect(new Set(nonNull).size).toBe(nonNull.length);
  });

  // Indices match the prototype: only messages addressed to the user by
  // name carry {name}; the "we'll only show one per session" interstitial
  // (1) and the genderless PB-clock copy (4) deliberately omit it.
  it("contains {name} only at the indices the prototype substitutes", () => {
    const expected = [true, false, true, true, false, true, true];
    MOTIVATION_MESSAGES.forEach((m, i) => {
      expect(m.template.includes("{name}")).toBe(expected[i]);
    });
  });
});

describe("MOTIVATION_MESSAGES iconKey vs ICONS map", () => {
  it("every non-null iconKey resolves to a component in ICONS", () => {
    for (const m of MOTIVATION_MESSAGES) {
      if (m.iconKey === null) continue;
      expect(ICONS[m.iconKey]).toBeDefined();
    }
  });

  it("ICONS has no keys beyond those used in MOTIVATION_MESSAGES", () => {
    const used = new Set(
      MOTIVATION_MESSAGES
        .map((m) => m.iconKey)
        .filter((k): k is Exclude<typeof k, null> => k !== null),
    );
    expect(new Set(Object.keys(ICONS))).toEqual(used);
  });
});
