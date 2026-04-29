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
            onClick={() => onChange(range)}
          >
            {range}
          </button>
        );
      })}
    </div>
  );
}
