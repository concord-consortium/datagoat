import { describe, it, expect } from "vitest";
import { MOTIVATION_MESSAGES } from "./motivationMessages";
import { ICONS } from "../components/dashboard/MotivationMessage";

describe("MOTIVATION_MESSAGES", () => {
  it("has 6 entries", () => {
    expect(MOTIVATION_MESSAGES).toHaveLength(6);
  });

  // DGT-60: the prototype's source array carried a spec note describing
  // the carousel ("We'll only show one message per session ...") as if
  // it were a message; it leaked into the live UI and has been removed.
  it("does not include the prototype's spec-note copy (DGT-60)", () => {
    const hasSpecNote = MOTIVATION_MESSAGES.some((m) =>
      m.template.includes("only show one message per"),
    );
    expect(hasSpecNote).toBe(false);
  });

  it("has unique non-null iconKeys", () => {
    const nonNull = MOTIVATION_MESSAGES
      .map((m) => m.iconKey)
      .filter((k): k is Exclude<typeof k, null> => k !== null);
    expect(new Set(nonNull).size).toBe(nonNull.length);
  });

  // Only messages addressed to the user by name carry {name}; the
  // genderless PB-clock copy (index 3) deliberately omits it.
  it("contains {name} only at the indices the prototype substitutes", () => {
    const expected = [true, true, true, false, true, true];
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
