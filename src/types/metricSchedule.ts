// How often a metric expects entries. Drives (in a follow-up) the
// dashboard reminders and the calendar "done for the day" decoration:
// a metric only counts toward "done today" when its schedule makes it
// due today.
//
// The shape is `{ period, count }` rather than a daily/not-daily boolean
// so it can express weekly/monthly/yearly cadences and multiple-per-
// period entries ("3× daily", "2× weekly") without a later migration. The
// top-level container is named `schedule` (not `frequency`) so a future
// anchoring element (e.g. "due Mondays / the 1st") can join `period` and
// `count` without renaming the field. Whether "due" is calendar-anchored
// or rolls from the last entry is deferred to the reminders/badges work.
//
// `irregular` means "no cadence at all" (ad-hoc entry, never reminded).
// A metric that IS regular but infrequent (Lean Mass, ~2-3×/year) uses
// `yearly`, not `irregular`, so it can still drive a reminder later.
export type SchedulePeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "irregular";

// Day of week, matching Date.getDay(): 0 = Sunday … 6 = Saturday.
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MetricSchedule {
  period: SchedulePeriod;
  // Entries expected within `period`. Omitted => 1. Meaningless for
  // "irregular" (no scheduled entries), where it is ignored.
  count?: number;
  // Weekly only: the exact weekdays the metric is due on. When present it is
  // authoritative - it overrides the count-derived default day set, and its
  // length is the weekly quota (so an explicit `days` makes `count`
  // redundant, and the persistence boundaries drop `count` in its favor). A
  // metric only recommends a frequency; which weekdays make sense is the
  // user's call, so this is populated by user schedules rather than built-in
  // definitions.
  days?: Weekday[];
}

// Fallback for any metric without an explicit schedule. Existing
// user-created custom metrics (saved before this field existed) and any
// built-in/override left unset read as "irregular" - no reminders, never
// blocks "done for the day" - so no data migration is required.
export const DEFAULT_SCHEDULE: MetricSchedule = { period: "irregular" };

// Effective schedule for a metric: a user override wins over the metric's
// own (built-in default or custom-def) schedule, which wins over the
// irregular default. Override replaces base wholesale - schedule is a
// small atomic unit, so we don't merge `period` from one source with
// `count` from another.
export function resolveSchedule(
  base: MetricSchedule | undefined,
  override?: MetricSchedule,
): MetricSchedule {
  return override ?? base ?? DEFAULT_SCHEDULE;
}

const SCHEDULE_PERIODS: readonly SchedulePeriod[] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "irregular",
];

// Canonicalize a count for a given period. Count is meaningful only for
// periodic schedules and only as a positive integer; anything else
// (irregular period, 0, negative, fractional, non-finite) collapses to
// an absent count, which downstream treats as "once per period". The
// single source of truth for the count rule - shared by the Firestore
// read/write boundaries, the display formatter, equality, and the editor
// field - so "what counts as a valid count" can't drift between them.
export function normalizedCount(
  period: SchedulePeriod,
  count: unknown,
): number | undefined {
  if (period === "irregular") return undefined;
  if (typeof count === "number" && Number.isInteger(count) && count >= 1) {
    return count;
  }
  return undefined;
}

// Canonicalize an explicit weekly day set. Days are meaningful only for weekly
// schedules and only as integers 0-6 (Sun-Sat); anything else is dropped. The
// result is deduped and sorted ascending, or undefined when the input is not a
// weekly period, not an array, or has no valid day left (so "no usable days"
// falls back to the count-derived default). The single source of truth for day
// validity, shared by the Firestore boundaries, equality, and the formatter.
export function normalizedDays(
  period: SchedulePeriod,
  days: unknown,
): Weekday[] | undefined {
  if (period !== "weekly" || !Array.isArray(days)) return undefined;
  const valid = days.filter(
    (d): d is Weekday => Number.isInteger(d) && d >= 0 && d <= 6,
  );
  const unique = [...new Set(valid)].sort((a, b) => a - b);
  return unique.length ? unique : undefined;
}

// Read a schedule out of an untrusted Firestore value. Lenient by
// design: a missing field, a legacy doc written before schedule existed,
// or a malformed value all read as undefined, which resolveSchedule
// treats as "irregular". This is what lets the field ship without a data
// migration - nothing breaks on docs that predate it.
export function parseStoredSchedule(raw: unknown): MetricSchedule | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const row = raw as Record<string, unknown>;
  if (!SCHEDULE_PERIODS.includes(row.period as SchedulePeriod)) {
    return undefined;
  }
  const schedule: MetricSchedule = { period: row.period as SchedulePeriod };
  // An explicit day set is authoritative and makes count redundant; only fall
  // back to count when there are no usable days.
  const days = normalizedDays(schedule.period, row.days);
  if (days !== undefined) {
    schedule.days = days;
  } else {
    const count = normalizedCount(schedule.period, row.count);
    if (count !== undefined) schedule.count = count;
  }
  return schedule;
}

// Structural equality of two schedules, treating an omitted count as 1
// and ignoring count entirely for irregular. Lets a form decide whether
// an edited schedule actually differs from the metric's default before
// writing (or clearing) an override.
export function schedulesEqual(a: MetricSchedule, b: MetricSchedule): boolean {
  if (a.period !== b.period) return false;
  if (a.period === "irregular") return true;
  // An explicit weekly day set is compared as a set; a day-set schedule and a
  // count-derived one are treated as distinct representations (only one carries
  // days), so editing to explicit days always registers as a change to persist.
  const daysA = normalizedDays(a.period, a.days);
  const daysB = normalizedDays(b.period, b.days);
  if (daysA || daysB) {
    return (
      daysA !== undefined &&
      daysB !== undefined &&
      daysA.length === daysB.length &&
      daysA.every((d, i) => d === daysB[i])
    );
  }
  // Compare normalized counts so a non-canonical count (e.g. 2.5, 0) is
  // treated as the 1 it persists as - otherwise the override form could
  // judge an edited schedule "different" from the default and write an
  // override that scheduleToFirestore then flattens back to the default.
  return (
    (normalizedCount(a.period, a.count) ?? 1) ===
    (normalizedCount(b.period, b.count) ?? 1)
  );
}

// Build a Firestore-safe plain object from a schedule, dropping an
// undefined count so we never write `undefined` into a document.
export function scheduleToFirestore(
  schedule: MetricSchedule,
): Record<string, unknown> {
  const out: Record<string, unknown> = { period: schedule.period };
  // Mirror parseStoredSchedule: an explicit day set is written and makes count
  // redundant; only persist a count when there are no usable days.
  const days = normalizedDays(schedule.period, schedule.days);
  if (days !== undefined) {
    out.days = days;
  } else {
    const count = normalizedCount(schedule.period, schedule.count);
    if (count !== undefined) out.count = count;
  }
  return out;
}

const PERIOD_LABEL: Record<SchedulePeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  irregular: "Irregular",
};

// Human-readable label for a schedule, e.g. "Daily", "Weekly",
// "3× Daily". `count` defaults to 1; a count > 1 prefixes the period
// label ("2× Weekly"). The period word uses the same capitalized
// PERIOD_LABEL in both the single- and multi-count cases so casing is
// consistent within a UI. Irregular ignores count.
export function formatSchedule(schedule: MetricSchedule): string {
  if (schedule.period === "irregular") return PERIOD_LABEL.irregular;
  // An explicit weekly day set defines the quota by its length; otherwise
  // normalize the count so an invalid in-memory count (e.g. 2.5 from transient
  // form state) can't render as "2.5× Daily" - matches the rules applied at the
  // Firestore boundaries.
  const days = normalizedDays(schedule.period, schedule.days);
  const count = days
    ? days.length
    : (normalizedCount(schedule.period, schedule.count) ?? 1);
  if (count > 1) return `${count}× ${PERIOD_LABEL[schedule.period]}`;
  return PERIOD_LABEL[schedule.period];
}
