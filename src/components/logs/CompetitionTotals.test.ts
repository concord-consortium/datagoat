import { describe, expect, it } from "vitest";
import { competitionTotal, winningPercentageRate } from "./CompetitionTotals";
import { HISTORY, isoAtDaysAgo } from "../../utils/dates";
import type { CompetitionEntry } from "../../types/data";

function entry(daysAgo: number, metrics: CompetitionEntry["metrics"]): CompetitionEntry {
  return { version: 1, date: isoAtDaysAgo(daysAgo), metrics };
}

describe("competitionTotal", () => {
  it("returns undefined when no entries exist", () => {
    expect(competitionTotal([], "goals")).toBeUndefined();
  });

  it("returns undefined when no entries record the metric", () => {
    expect(
      competitionTotal([entry(0, { assists: 3 }), entry(1, { yards: 20 })], "goals"),
    ).toBeUndefined();
  });

  it("sums in-window entries", () => {
    expect(
      competitionTotal(
        [entry(0, { goals: 2 }), entry(5, { goals: 3 }), entry(10, { goals: 1 })],
        "goals",
      ),
    ).toBe(6);
  });

  it("preserves a genuine zero total when in-window entries logged zero", () => {
    // Regression: an earlier implementation used hasEntriesForMetric (no
    // window filter) as the render gate while competitionTotal filtered
    // by window, producing a misleading "0" when only out-of-window
    // entries existed. After the refactor, the function distinguishes
    // "no in-window entries" (undefined) from "in-window entries that
    // happened to sum to zero" (0).
    expect(competitionTotal([entry(0, { goals: 0 }), entry(1, { goals: 0 })], "goals")).toBe(0);
  });

  it("returns undefined when all entries for the metric fall outside the HISTORY window", () => {
    // Regression: the bug Copilot caught — entries outside the window
    // would still render as a "0" Total because hasEntriesForMetric
    // didn't filter by window. Now the helper returns undefined and the
    // call site renders blank.
    expect(
      competitionTotal(
        [entry(HISTORY + 1, { goals: 5 }), entry(HISTORY + 5, { goals: 3 })],
        "goals",
      ),
    ).toBeUndefined();
  });

  it("includes in-window entries and excludes out-of-window ones from the sum", () => {
    expect(
      competitionTotal(
        [
          entry(0, { goals: 2 }), // in window → +2
          entry(HISTORY, { goals: 4 }), // at the window edge → +4
          entry(HISTORY + 1, { goals: 100 }), // outside → skipped
        ],
        "goals",
      ),
    ).toBe(6);
  });

  it("skips non-numeric values", () => {
    expect(
      competitionTotal(
        [entry(0, { goals: "n/a" }), entry(1, { goals: 5 })],
        "goals",
      ),
    ).toBe(5);
  });
});

describe("winningPercentageRate", () => {
  it("returns undefined when no Win/Loss entries are in window", () => {
    expect(winningPercentageRate([])).toBeUndefined();
    expect(
      winningPercentageRate([entry(HISTORY + 1, { winningPercentage: 1 })]),
    ).toBeUndefined();
  });

  it("computes wins / (wins + losses) * 100 as an integer", () => {
    expect(
      winningPercentageRate([
        entry(0, { winningPercentage: 1 }),
        entry(1, { winningPercentage: 1 }),
        entry(2, { winningPercentage: 0 }),
      ]),
    ).toBe(67);
  });

  it("reports 0% when all in-window entries are losses", () => {
    expect(
      winningPercentageRate([
        entry(0, { winningPercentage: 0 }),
        entry(1, { winningPercentage: 0 }),
      ]),
    ).toBe(0);
  });

  it("reports 100% when all in-window entries are wins", () => {
    expect(
      winningPercentageRate([
        entry(0, { winningPercentage: 1 }),
        entry(1, { winningPercentage: 1 }),
      ]),
    ).toBe(100);
  });

  it("ignores non-W/L values stored under the same key", () => {
    // Defensive: a stray non-0/1 value (e.g., legacy data) should not
    // count toward wins or losses; result should reflect only the
    // Win/Loss entries.
    expect(
      winningPercentageRate([
        entry(0, { winningPercentage: 1 }),
        entry(1, { winningPercentage: 0.5 }),
      ]),
    ).toBe(100);
  });
});
