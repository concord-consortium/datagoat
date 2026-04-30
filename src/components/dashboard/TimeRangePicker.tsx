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
// short pill label ("7d") for space; the aria-label expands it so SR
// users hear "7 days" instead of "seven d".
const RANGE_LABELS: Record<TimeRangeKey, string> = {
  "7d": "7 days",
  "2w": "2 weeks",
  "30d": "30 days",
  "3mo": "3 months",
  "6mo": "6 months",
  All: "All time",
};

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
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {RANGES.map((range) => {
        const isActive = value === range;
        return (
          <button
            key={range}
            type="button"
            className={`${css.timeRangeBtn} ${isActive ? css.active : ""}`}
            role="radio"
            aria-checked={isActive}
            aria-label={RANGE_LABELS[range]}
            onClick={() => onChange(range)}
          >
            {range}
          </button>
        );
      })}
    </div>
  );
}
