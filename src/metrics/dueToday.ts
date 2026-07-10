// Calendar-anchored "due today" engine. Pure logic, no UI, no data layer:
// given a metric's schedule (and, for the reminder, an injected view of what's
// been logged), it decides which tracked metrics still need logging on a given
// day - the set behind the "Log <n> remaining metrics." message.
//
// Two ideas, kept separate:
//   1. Calendar-due (isScheduleDueOn / metricsDueOn): is `date` a scheduled day
//      for this cadence? Daily → every day; weekly → the anchor weekdays
//      (1×→Wed, 2×→Tue/Thu, 3×→Mon/Wed/Fri, ...). This ignores history and is
//      what the UI uses to indicate which fields are scheduled.
//   2. Remaining (remainingToLog): of the metrics scheduled today, which are
//      behind pace for the current week. A metric nags on a scheduled day only
//      when the entries logged so far this week fall short of the scheduled
//      days elapsed so far - so keeping up earlier in the week (even on
//      non-scheduled days) clears a later scheduled-day reminder. A Mon/Wed/Fri
//      metric logged twice by Wednesday is on pace and won't nag, but still
//      needs a third entry by Friday.
//
// Only `daily` and `weekly` drive the reminder. `monthly` / `yearly` /
// `irregular` are never counted as due today: infrequent metrics (e.g. a
// twice-a-year body measurement) shouldn't nag daily on calendar dates we'd
// have to invent for them.

import {
  normalizedCount,
  normalizedDays,
  resolveSchedule,
  type MetricSchedule,
} from "../types/metricSchedule";
import { DAY_NAMES } from "../utils/dates";

// The minimal metric shape the engine reads: an id and an optional schedule.
// Built-in MetricDefinitions and the user's custom-metric defs both satisfy it,
// so the engine works over built-in, addable, and custom metrics alike.
export interface ScheduledMetric {
  id: string;
  schedule?: MetricSchedule;
}

// Weekday numbers match Date.getDay(): 0 = Sunday … 6 = Saturday.
const MON = 1;
const TUE = 2;
const WED = 3;
const THU = 4;
const FRI = 5;
const SAT = 6;
const EVERY_DAY: ReadonlySet<number> = new Set([0, 1, 2, 3, 4, 5, 6]);

// The calendar week is Monday-anchored for now. Letting the user pick
// Mon-Sun / Sun-Sat / Sat-Fri is out of scope here; when that lands, this
// constant becomes a parameter threaded from user settings.
const WEEK_STARTS_ON = MON;

// Which weekdays a `weekly` schedule of `count` entries defaults to, when the
// schedule doesn't name explicit days. Spread across the workweek: 1×→Wed
// (centered), 2×→Tue/Thu, 3×→Mon/Wed/Fri; 4-6 fill outward and 7+ collapses to
// every day. A count below 1 is treated as 1. Only recommends days - the user
// can override with an explicit `days` set on the schedule.
const WEEKLY_DUE_DAYS: Record<number, number[]> = {
  1: [WED],
  2: [TUE, THU],
  3: [MON, WED, FRI],
  4: [MON, TUE, THU, FRI],
  5: [MON, TUE, WED, THU, FRI],
  6: [MON, TUE, WED, THU, FRI, SAT],
};

export function weeklyDueDays(count: number): Set<number> {
  const c = Number.isFinite(count) ? Math.trunc(count) : 1;
  if (c >= 7) return new Set(EVERY_DAY);
  return new Set(WEEKLY_DUE_DAYS[c >= 1 ? c : 1]);
}

// The weekdays a weekly schedule is due on: its explicit `days` when set,
// otherwise the count-derived default.
function dueWeekdays(schedule: MetricSchedule): Set<number> {
  const days = normalizedDays(schedule.period, schedule.days);
  if (days) return new Set(days);
  return weeklyDueDays(normalizedCount("weekly", schedule.count) ?? 1);
}

// Is a metric with this (already-resolved) schedule scheduled on `date`?
// Calendar-only - does not consider what has been logged.
export function isScheduleDueOn(schedule: MetricSchedule, date: Date): boolean {
  switch (schedule.period) {
    case "daily":
      return true;
    case "weekly":
      return dueWeekdays(schedule).has(date.getDay());
    // monthly / yearly / irregular never drive the daily reminder.
    default:
      return false;
  }
}

// The tracked metrics scheduled on `date`, in input order. Each metric's
// effective schedule is resolved (its own schedule, else irregular) before the
// due check; callers with user overrides should pass metrics whose `schedule`
// already reflects the override.
export function metricsDueOn<T extends ScheduledMetric>(
  metrics: T[],
  date: Date,
): T[] {
  return metrics.filter((m) =>
    isScheduleDueOn(resolveSchedule(m.schedule), date),
  );
}

// The metrics scheduled on `date` that have not yet met their quota for the
// current period - the set behind the "Log <n> remaining metrics." message (its
// length is n). `wasLogged(id, day)` keeps the engine pure; the caller supplies
// the real per-day logged state.
export function remainingToLog<T extends ScheduledMetric>(
  metrics: T[],
  date: Date,
  wasLogged: (metricId: string, day: Date) => boolean,
): T[] {
  return metricsDueOn(metrics, date).filter((m) => {
    const schedule = resolveSchedule(m.schedule);
    return (
      loggedInPeriod(m.id, schedule, date, wasLogged) <
      expectedByDate(schedule, date)
    );
  });
}

// How many entries a schedule expects by `date` within the current period: for
// weekly, the scheduled weekdays that have already occurred this week (Monday-
// start, including today); daily expects one (today). Comparing this against
// the count logged so far makes the reminder "are you on pace?" rather than
// "have you hit the full weekly quota?".
function expectedByDate(schedule: MetricSchedule, date: Date): number {
  if (schedule.period !== "weekly") return 1;
  const todayPos = weekPos(date.getDay());
  let expected = 0;
  for (const day of dueWeekdays(schedule)) {
    if (weekPos(day) <= todayPos) expected += 1;
  }
  return expected;
}

// Position of a weekday within the current week: 0 at the week start,
// increasing through the week.
function weekPos(weekday: number): number {
  return (weekday - WEEK_STARTS_ON + 7) % 7;
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
  return addDays(date, -weekPos(date.getDay()));
}

// Human-readable read-only summary of which days a schedule is due, for display
// next to the schedule editor. "Every day" for daily (or a 7-day weekly), the
// weekday abbreviations Monday-first for weekly (e.g. "Mon, Wed, Fri"), and ""
// for periods without weekday anchoring (monthly / yearly / irregular).
export function formatDueDays(schedule: MetricSchedule): string {
  if (schedule.period === "daily") return "Every day";
  if (schedule.period !== "weekly") return "";
  const days = dueWeekdays(schedule);
  if (days.size >= 7) return "Every day";
  return [...days]
    .sort((a, b) => weekPos(a) - weekPos(b))
    .map((d) => DAY_NAMES[d])
    .join(", ");
}
