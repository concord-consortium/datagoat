// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  weeklyDueDays,
  isScheduleDueOn,
  metricsDueOn,
  remainingToLog,
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
  it("1× per week is due Monday only", () => {
    expect(weeklyDueDays(1)).toEqual(new Set([1]));
  });

  it("2× per week is due Monday and Tuesday", () => {
    expect(weeklyDueDays(2)).toEqual(new Set([1, 2]));
  });

  it("3× per week is due Monday, Wednesday, Friday", () => {
    expect(weeklyDueDays(3)).toEqual(new Set([1, 3, 5]));
  });

  it("4× per week fills Monday through Thursday", () => {
    expect(weeklyDueDays(4)).toEqual(new Set([1, 2, 3, 4]));
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

  it("weekly 1× is due Monday and not other days", () => {
    expect(isScheduleDueOn({ period: "weekly", count: 1 }, MON)).toBe(true);
    expect(isScheduleDueOn({ period: "weekly", count: 1 }, TUE)).toBe(false);
    expect(isScheduleDueOn({ period: "weekly", count: 1 }, SUN)).toBe(false);
  });

  it("weekly with an omitted count behaves as 1× (Monday)", () => {
    expect(isScheduleDueOn({ period: "weekly" }, MON)).toBe(true);
    expect(isScheduleDueOn({ period: "weekly" }, TUE)).toBe(false);
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
      mk("weight", { period: "weekly" }), // Monday
      mk("threeX", { period: "weekly", count: 3 }), // Mon/Wed/Fri
      mk("leanMass", { period: "yearly", count: 2 }),
    ];
    expect(metricsDueOn(metrics, MON).map((m) => m.id)).toEqual([
      "sleep",
      "weight",
      "threeX",
    ]);
    expect(metricsDueOn(metrics, TUE).map((m) => m.id)).toEqual(["sleep"]);
    expect(metricsDueOn(metrics, WED).map((m) => m.id)).toEqual([
      "sleep",
      "threeX",
    ]);
  });

  it("excludes metrics with no schedule (resolves to irregular)", () => {
    const metrics = [mk("competitionPR")]; // no schedule → irregular
    expect(metricsDueOn(metrics, MON)).toEqual([]);
  });
});

// remainingToLog is history-aware: on a scheduled day, a metric only remains if
// it has not yet met its quota for the current calendar week (Monday-start).
describe("remainingToLog", () => {
  it("counts a daily metric as remaining until it is logged that day", () => {
    const metrics = [mk("sleep", { period: "daily" }), mk("mood", { period: "daily" })];
    const wasLogged = loggedOn("sleep@2026-07-06"); // sleep logged Monday
    expect(remainingToLog(metrics, MON, wasLogged).map((m) => m.id)).toEqual([
      "mood",
    ]);
  });

  it("never reminds on a non-scheduled day, even if unlogged", () => {
    const metrics = [mk("weight", { period: "weekly" })]; // due Monday only
    expect(remainingToLog(metrics, TUE, () => false)).toEqual([]);
  });

  it("counts distinct logged days in the current week only", () => {
    const metrics = [mk("weight", { period: "weekly" })]; // 1× per week, due Monday
    // Logged last week's Monday (2026-06-29), nothing this week.
    const wasLogged = loggedOn("weight@2026-06-29");
    expect(remainingToLog(metrics, MON, wasLogged).map((m) => m.id)).toEqual([
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
});
