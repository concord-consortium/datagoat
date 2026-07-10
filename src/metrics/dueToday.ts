// Calendar-anchored "due today" engine. Pure logic, no UI, no data layer:
// given a metric's schedule (and, for the reminder, an injected view of what's
// been logged), it decides which tracked metrics still need logging on a given
// day - the set behind the "Log <n> remaining metrics." message.
//
// Two ideas, kept separate:
//   1. Calendar-due (isScheduleDueOn / metricsDueOn): is `date` a scheduled day
//      for this cadence? Daily → every day; weekly → the anchor weekdays
//      (1×→Mon, 2×→Mon/Tue, 3×→Mon/Wed/Fri, ...). This ignores history and is
//      what the UI uses to indicate which fields are scheduled.
//   2. Remaining (remainingToLog): of the metrics scheduled today, which have
//      NOT yet met their quota for the current period. Entering data early
//      satisfies the period and removes the reminder - e.g. logging a weekly
//      metric earlier in the week clears its scheduled-day reminder.
//
// Only `daily` and `weekly` drive the reminder. `monthly` / `yearly` /
// `irregular` are never counted as due today: infrequent metrics (e.g. a
// twice-a-year body measurement) shouldn't nag daily on calendar dates we'd
// have to invent for them.

import type { MetricDefinition } from "./types";
import {
  normalizedCount,
  resolveSchedule,
  type MetricSchedule,
} from "../types/metricSchedule";

// Weekday numbers match Date.getDay(): 0 = Sunday … 6 = Saturday.
// (Same convention as DAY_NAMES in src/utils/dates.ts.)
const MON = 1;
const EVERY_DAY: ReadonlySet<number> = new Set([0, 1, 2, 3, 4, 5, 6]);

// The calendar week is Monday-anchored for now. Letting the user pick
// Mon-Sun / Sun-Sat / Sat-Fri is out of scope here; when that lands, this
// constant becomes a parameter threaded from user settings.
const WEEK_STARTS_ON = MON;

// Which weekdays a `weekly` schedule of `count` entries is due on. The 1×/2×/3×
// mappings are the specified cadence (1→Mon, 2→Mon/Tue, 3→Mon/Wed/Fri); counts
// of 4-6 front-load the extra days onto the earliest weekdays, and 7+ collapses
// to every day. A count below 1 is treated as 1.
const WEEKLY_DUE_DAYS: Record<number, number[]> = {
  1: [MON],
  2: [MON, 2],
  3: [MON, 3, 5],
  4: [MON, 2, 3, 4],
  5: [MON, 2, 3, 4, 5],
  6: [MON, 2, 3, 4, 5, 6],
};

export function weeklyDueDays(count: number): Set<number> {
  const c = Number.isFinite(count) ? Math.trunc(count) : 1;
  if (c >= 7) return new Set(EVERY_DAY);
  return new Set(WEEKLY_DUE_DAYS[c >= 1 ? c : 1]);
}

// Is a metric with this (already-resolved) schedule scheduled on `date`?
// Calendar-only - does not consider what has been logged.
export function isScheduleDueOn(schedule: MetricSchedule, date: Date): boolean {
  switch (schedule.period) {
    case "daily":
      return true;
    case "weekly": {
      const count = normalizedCount("weekly", schedule.count) ?? 1;
      return weeklyDueDays(count).has(date.getDay());
    }
    // monthly / yearly / irregular never drive the daily reminder.
    default:
      return false;
  }
}

// The tracked metrics scheduled on `date`, in input order. Each metric's
// effective schedule is resolved (its own schedule, else irregular) before the
// due check; callers with user overrides should pass metrics whose `schedule`
// already reflects the override.
export function metricsDueOn(
  metrics: MetricDefinition[],
  date: Date,
): MetricDefinition[] {
  return metrics.filter((m) =>
    isScheduleDueOn(resolveSchedule(m.schedule), date),
  );
}

// The metrics scheduled on `date` that have not yet met their quota for the
// current period - the set behind the "Log <n> remaining metrics." message (its
// length is n). `wasLogged(id, day)` keeps the engine pure; the caller supplies
// the real per-day logged state.
export function remainingToLog(
  metrics: MetricDefinition[],
  date: Date,
  wasLogged: (metricId: string, day: Date) => boolean,
): MetricDefinition[] {
  return metricsDueOn(metrics, date).filter((m) => {
    const schedule = resolveSchedule(m.schedule);
    const required = normalizedCount(schedule.period, schedule.count) ?? 1;
    return loggedInPeriod(m.id, schedule, date, wasLogged) < required;
  });
}

// How many distinct days in the current period (up to and including `date`)
// have a logged entry for `metricId`. One entry per metric per day, so a day
// counts at most once. Daily → just today; weekly → this calendar week so far.
function loggedInPeriod(
  metricId: string,
  schedule: MetricSchedule,
  date: Date,
  wasLogged: (metricId: string, day: Date) => boolean,
): number {
  const start =
    schedule.period === "weekly" ? startOfWeek(date) : atMidnight(date);
  let count = 0;
  for (let day = start; day <= date; day = addDays(day, 1)) {
    if (wasLogged(metricId, day)) count += 1;
  }
  return count;
}

function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Add whole days via the y/m/d constructor so results land on local midnight
// and are DST-safe (no 23/25-hour arithmetic drift).
function addDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function startOfWeek(date: Date): Date {
  const diff = (date.getDay() - WEEK_STARTS_ON + 7) % 7;
  return addDays(date, -diff);
}
