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

export interface MetricSchedule {
  period: SchedulePeriod;
  // Entries expected within `period`. Omitted => 1. Meaningless for
  // "irregular" (no scheduled entries), where it is ignored.
  count?: number;
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
  const count = normalizedCount(schedule.period, row.count);
  if (count !== undefined) schedule.count = count;
  return schedule;
}

// Structural equality of two schedules, treating an omitted count as 1
// and ignoring count entirely for irregular. Lets a form decide whether
// an edited schedule actually differs from the metric's default before
// writing (or clearing) an override.
export function schedulesEqual(a: MetricSchedule, b: MetricSchedule): boolean {
  if (a.period !== b.period) return false;
  if (a.period === "irregular") return true;
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
  const count = normalizedCount(schedule.period, schedule.count);
  if (count !== undefined) out.count = count;
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
  // Normalize so an invalid in-memory count (e.g. 2.5 from transient
  // form state) can't render as "2.5× Daily" - matches the rules applied
  // at the Firestore boundaries.
  const count = normalizedCount(schedule.period, schedule.count) ?? 1;
  if (count > 1) return `${count}× ${PERIOD_LABEL[schedule.period]}`;
  return PERIOD_LABEL[schedule.period];
}
