import type { MetricSchedule } from "../types/metricSchedule";

// Frequency sections on the Metrics Data Entry Log, in display order.
//
// These are a presentation grouping derived from the existing schedule
// model, not a new field on it. "Quarterly" and "As Needed" are already
// expressible as {period: "yearly", count: 4} and {period: "irregular"},
// so adding them to SchedulePeriod would duplicate state that the
// due-today engine, the custom-metric form, and stored user schedules
// all already read.
export const SECTIONS = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "asNeeded",
] as const;

export type SectionKey = (typeof SECTIONS)[number];

// Entries-per-year that reads as "quarterly". Matched exactly rather than
// with >=: a metric set to 6x/year is not quarterly, and labelling it so
// is a mismatch the user can see on the page.
const QUARTERLY_COUNT = 4;

// Total: every schedule lands in exactly one section. Metrics with no
// schedule resolve to DEFAULT_SCHEDULE (irregular) upstream via
// resolveSchedule, and so arrive here as "irregular".
export function sectionFor(schedule: MetricSchedule): SectionKey {
  switch (schedule.period) {
    case "daily":
      return "daily";
    case "weekly":
      return "weekly";
    case "monthly":
      return "monthly";
    case "yearly":
      return schedule.count === QUARTERLY_COUNT ? "quarterly" : "yearly";
    case "irregular":
      return "asNeeded";
  }
}

const LABELS: Record<SectionKey, string> = {
  daily: "Daily Metrics",
  weekly: "Weekly Metrics",
  monthly: "Monthly Metrics",
  quarterly: "Quarterly Metrics",
  yearly: "Yearly Metrics",
  asNeeded: "As Needed Metrics",
};

export function sectionLabel(key: SectionKey): string {
  return LABELS[key];
}

const EMPTY_TEXT: Record<SectionKey, string> = {
  daily: "No daily metrics to track",
  weekly: "No weekly metrics to track",
  monthly: "No monthly metrics to track",
  quarterly: "No quarterly metrics to track",
  yearly: "No yearly metrics to track",
  asNeeded: "No as-needed metrics to track",
};

export function sectionEmptyText(key: SectionKey): string {
  return EMPTY_TEXT[key];
}
