import common from "../common.module.css";
import css from "./TimeRangePicker.module.css";

// Day count per pill. Matches the prototype's data-range attribute values
// (HTML around line 4211-4216). The pill label "7d" / "2w" / etc. is
// purely display - the key/days are the load-bearing values.
export const TIME_RANGE_DAYS = {
  "7d": 7,
  "2w": 14,
  "30d": 30,
  "3mo": 90,
  "6mo": 180,
  All: 365,
} as const;

export type TimeRangeKey = keyof typeof TIME_RANGE_DAYS;

const RANGES: TimeRangeKey[] = ["7d", "2w", "30d", "3mo", "6mo", "All"];

// Self-describing names for screen readers. Visible buttons keep the
// short pill label ("7d") for space; a visually-hidden expansion is
// appended so SR users hear "7d (7 days)" while voice control can
// still match the visible "7d" (WCAG 2.5.3 Label in Name).
const RANGE_LABELS: Record<TimeRangeKey, string> = {
  "7d": "7 days",
  "2w": "2 weeks",
  "30d": "30 days",
  "3mo": "3 months",
  "6mo": "6 months",
  All: "All time",
};

// Heading-style label (e.g. "Last 7 days", "All time") used by MetricDetail's
// chart-date strip and shared by the SR description phrase below.
export function rangeLabel(range: TimeRangeKey): string {
  switch (range) {
    case "7d":
      return "Last 7 days";
    case "2w":
      return "Last 2 weeks";
    case "30d":
      return "Last 30 days";
    case "3mo":
      return "Last 3 months";
    case "6mo":
      return "Last 6 months";
    case "All":
      return "All time";
  }
}

// Natural-language phrase fragment for SR descriptions, e.g. "<metric> ${phrase}.".
// "All" gets "across all time" so the sentence doesn't collapse to the
// ungrammatical "over the all time".
export function rangeDescriptionPhrase(range: TimeRangeKey): string {
  if (range === "All") return "across all time";
  return `over the ${rangeLabel(range).toLowerCase()}`;
}

export interface TimeRangePickerProps {
  value: TimeRangeKey;
  onChange: (next: TimeRangeKey) => void;
  // Optional accessible group label - DashboardChartCard passes the
  // associated metric name so SR users hear "Hydration time range"
  // when the picker is active.
  ariaLabel?: string;
}

export function TimeRangePicker({
  value,
  onChange,
  ariaLabel = "Chart time range",
}: TimeRangePickerProps) {
  return (
    <div
      className={css.timeRangePicker}
      role="group"
      aria-label={ariaLabel}
    >
      {RANGES.map((range) => {
        const isActive = value === range;
        return (
          <button
            key={range}
            type="button"
            className={`${css.timeRangeBtn} ${isActive ? css.active : ""}`}
            aria-pressed={isActive}
            onClick={() => onChange(range)}
          >
            {range}
            <span className={common.visuallyHidden}> ({RANGE_LABELS[range]})</span>
          </button>
        );
      })}
    </div>
  );
}
