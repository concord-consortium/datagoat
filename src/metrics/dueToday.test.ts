// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  weeklyDueDays,
  isScheduleDueOn,
  metricsDueOn,
  remainingToLog,
  formatDueDays,
} from "./dueToday";
import type { MetricSchedule } from "../types/metricSchedule";
import type { MetricDefinition } from "./types";

// A known week in July 2026, verified against the calendar (Date months are
// 0-indexed, so 6 === July). 2026-07-06 is a Monday.
const MON = new Date(2026, 6, 6);
const TUE = new Date(2026, 6, 7);
const WED = new Date(2026, 6, 8);
const THU = new Date(2026, 6, 9);
const FRI = new Date(2026, 6, 10);
const SAT = new Date(2026, 6, 11);
const SUN = new Date(2026, 6, 12);

// Local YYYY-MM-DD key, matching how entries are keyed by day.
function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// Build a `wasLogged(id, date)` predicate from a list of "id@YYYY-MM-DD" days.
function loggedOn(...keys: string[]) {
  const set = new Set(keys);
  return (id: string, d: Date) => set.has(`${id}@${iso(d)}`);
}

// Minimal MetricDefinition factory: fills the required fields so a test can
// focus on id + schedule, which is all the engine reads.
function mk(id: string, schedule?: MetricSchedule): MetricDefinition {
  return {
    id,
    name: id,
    unit: "",
    type: "health",
    whoCollects: "",
    howCollected: "",
    description: "",
    inputType: "numeric",
    ...(schedule ? { schedule } : {}),
  };
}

describe("weeklyDueDays", () => {
  it("1× per week centers on Wednesday", () => {
    expect(weeklyDueDays(1)).toEqual(new Set([3]));
  });

  it("2× per week spreads to Tuesday and Thursday", () => {
    expect(weeklyDueDays(2)).toEqual(new Set([2, 4]));
  });

  it("3× per week is Monday, Wednesday, Friday", () => {
    expect(weeklyDueDays(3)).toEqual(new Set([1, 3, 5]));
  });

  it("4× per week spreads across the workweek (Mon/Tue/Thu/Fri)", () => {
    expect(weeklyDueDays(4)).toEqual(new Set([1, 2, 4, 5]));
  });

  it("7× (or more) per week is due every day", () => {
    expect(weeklyDueDays(7)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
    expect(weeklyDueDays(10)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
  });
});

// isScheduleDueOn is calendar-only: "is today a scheduled day for this
// cadence?" - it does not consider whether anything has been logged.
describe("isScheduleDueOn", () => {
  it("daily is due every day, including weekends", () => {
    for (const d of [MON, TUE, WED, THU, FRI, SAT, SUN]) {
      expect(isScheduleDueOn({ period: "daily" }, d)).toBe(true);
    }
  });

  it("weekly 1× is due Wednesday and not other days", () => {
    expect(isScheduleDueOn({ period: "weekly", count: 1 }, WED)).toBe(true);
    expect(isScheduleDueOn({ period: "weekly", count: 1 }, MON)).toBe(false);
    expect(isScheduleDueOn({ period: "weekly", count: 1 }, SUN)).toBe(false);
  });

  it("weekly with an omitted count behaves as 1× (Wednesday)", () => {
    expect(isScheduleDueOn({ period: "weekly" }, WED)).toBe(true);
    expect(isScheduleDueOn({ period: "weekly" }, MON)).toBe(false);
  });

  it("weekly 3× is due Mon/Wed/Fri only", () => {
    const s: MetricSchedule = { period: "weekly", count: 3 };
    expect(isScheduleDueOn(s, MON)).toBe(true);
    expect(isScheduleDueOn(s, WED)).toBe(true);
    expect(isScheduleDueOn(s, FRI)).toBe(true);
    expect(isScheduleDueOn(s, TUE)).toBe(false);
    expect(isScheduleDueOn(s, THU)).toBe(false);
    expect(isScheduleDueOn(s, SAT)).toBe(false);
  });

  it("honors an explicit day set over the count-derived default", () => {
    const s: MetricSchedule = { period: "weekly", days: [1, 4] }; // Mon & Thu
    expect(isScheduleDueOn(s, MON)).toBe(true);
    expect(isScheduleDueOn(s, THU)).toBe(true);
    expect(isScheduleDueOn(s, WED)).toBe(false);
    expect(isScheduleDueOn(s, TUE)).toBe(false);
  });

  it("monthly is never due, even on the first of the month", () => {
    expect(isScheduleDueOn({ period: "monthly" }, new Date(2026, 6, 1))).toBe(
      false,
    );
  });

  it("yearly is never due, even on January 1", () => {
    expect(
      isScheduleDueOn({ period: "yearly", count: 2 }, new Date(2026, 0, 1)),
    ).toBe(false);
  });

  it("irregular is never due", () => {
    expect(isScheduleDueOn({ period: "irregular" }, MON)).toBe(false);
  });
});

// metricsDueOn is also calendar-only: the metrics scheduled on a given day.
describe("metricsDueOn", () => {
  it("returns only metrics whose resolved schedule is due that day", () => {
    const metrics = [
      mk("sleep", { period: "daily" }),
      mk("weight", { period: "weekly" }), // 1× → Wednesday
      mk("threeX", { period: "weekly", count: 3 }), // Mon/Wed/Fri
      mk("leanMass", { period: "yearly", count: 2 }),
    ];
    expect(metricsDueOn(metrics, MON).map((m) => m.id)).toEqual([
      "sleep",
      "threeX",
    ]);
    expect(metricsDueOn(metrics, TUE).map((m) => m.id)).toEqual(["sleep"]);
    expect(metricsDueOn(metrics, WED).map((m) => m.id)).toEqual([
      "sleep",
      "weight",
      "threeX",
    ]);
  });

  it("excludes metrics with no schedule (resolves to irregular)", () => {
    const metrics = [mk("competitionPR")]; // no schedule → irregular
    expect(metricsDueOn(metrics, MON)).toEqual([]);
  });

  it("works over any { id, schedule } shape, not just MetricDefinition", () => {
    // A custom-metric def carries only id + schedule; the engine reads nothing
    // more, so it must accept the bare shape (and keep the input type on out).
    const custom = [{ id: "c_1", schedule: { period: "daily" } as MetricSchedule }];
    expect(metricsDueOn(custom, MON).map((m) => m.id)).toEqual(["c_1"]);
    expect(remainingToLog(custom, MON, () => false).map((m) => m.id)).toEqual([
      "c_1",
    ]);
  });
});

// remainingToLog is history-aware: on a scheduled day, a metric only remains if
// it has not yet met its quota for the current calendar week (Monday-start).
describe("remainingToLog", () => {
  it("counts a daily metric as remaining until it is logged that day", () => {
    const metrics = [
      mk("sleep", { period: "daily" }),
      mk("mood", { period: "daily" }),
    ];
    const wasLogged = loggedOn("sleep@2026-07-06"); // sleep logged Monday
    expect(remainingToLog(metrics, MON, wasLogged).map((m) => m.id)).toEqual([
      "mood",
    ]);
  });

  it("never reminds on a non-scheduled day, even if unlogged", () => {
    const metrics = [mk("weight", { period: "weekly" })]; // due Wednesday only
    expect(remainingToLog(metrics, TUE, () => false)).toEqual([]);
  });

  it("counts distinct logged days in the current week only", () => {
    const metrics = [mk("weight", { period: "weekly" })]; // 1× → Wednesday
    // Logged last week (2026-07-01 Wed), nothing this week.
    const wasLogged = loggedOn("weight@2026-07-01");
    expect(remainingToLog(metrics, WED, wasLogged).map((m) => m.id)).toEqual([
      "weight",
    ]);
  });

  it("keeps reminding a weekly 3× metric on scheduled days until the quota is met", () => {
    const metrics = [mk("hydration", { period: "weekly", count: 3 })];
    const wasLogged = loggedOn("hydration@2026-07-06"); // only Monday so far (1 of 3)
    expect(remainingToLog(metrics, WED, wasLogged).map((m) => m.id)).toEqual([
      "hydration",
    ]);
    expect(remainingToLog(metrics, FRI, wasLogged).map((m) => m.id)).toEqual([
      "hydration",
    ]);
  });

  it("stops reminding once the week's quota is met early", () => {
    const metrics = [mk("hydration", { period: "weekly", count: 3 })];
    // Logged Mon, Tue, Wed => 3 entries by Wednesday.
    const wasLogged = loggedOn(
      "hydration@2026-07-06",
      "hydration@2026-07-07",
      "hydration@2026-07-08",
    );
    // Friday is a scheduled day, but the 3-entry weekly quota is already met.
    expect(remainingToLog(metrics, FRI, wasLogged)).toEqual([]);
  });

  it("does not nag on a scheduled day when entries are on pace", () => {
    const metrics = [mk("hydration", { period: "weekly", count: 3 })]; // Mon/Wed/Fri
    // Entered Monday and Tuesday: 2 entries by Wednesday, when 2 scheduled days
    // (Mon, Wed) have elapsed - on pace, so no Wednesday reminder even though
    // the full 3-per-week quota isn't met yet.
    const wasLogged = loggedOn("hydration@2026-07-06", "hydration@2026-07-07");
    expect(remainingToLog(metrics, WED, wasLogged)).toEqual([]);
    // Friday is the 3rd scheduled day, so a 3rd entry is now expected.
    expect(remainingToLog(metrics, FRI, wasLogged).map((m) => m.id)).toEqual([
      "hydration",
    ]);
  });

  it("uses an explicit day set's length as the weekly quota", () => {
    const metrics = [mk("lift", { period: "weekly", days: [1, 4] })]; // quota 2
    // Only Monday logged (1 of 2) => still remaining Thursday.
    expect(
      remainingToLog(metrics, THU, loggedOn("lift@2026-07-06")).map((m) => m.id),
    ).toEqual(["lift"]);
    // Mon + Tue logged (2 distinct days) => quota met, not remaining Thursday.
    expect(
      remainingToLog(
        metrics,
        THU,
        loggedOn("lift@2026-07-06", "lift@2026-07-07"),
      ),
    ).toEqual([]);
  });
});

describe("formatDueDays", () => {
  it("labels a daily schedule", () => {
    expect(formatDueDays({ period: "daily" })).toBe("Every day");
  });

  it("lists weekly due days in Monday-first order", () => {
    expect(formatDueDays({ period: "weekly", count: 1 })).toBe("Wed");
    expect(formatDueDays({ period: "weekly", count: 2 })).toBe("Tue, Thu");
    expect(formatDueDays({ period: "weekly", count: 3 })).toBe("Mon, Wed, Fri");
  });

  it("reflects an explicit day set, Monday-first (Sunday last)", () => {
    expect(formatDueDays({ period: "weekly", days: [0, 1] })).toBe("Mon, Sun");
  });

  it("collapses a full week to Every day", () => {
    expect(formatDueDays({ period: "weekly", count: 7 })).toBe("Every day");
  });

  it("returns empty for periods without weekday anchoring", () => {
    expect(formatDueDays({ period: "monthly" })).toBe("");
    expect(formatDueDays({ period: "yearly", count: 2 })).toBe("");
    expect(formatDueDays({ period: "irregular" })).toBe("");
  });
});
