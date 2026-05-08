import type { TimeRangeKey } from "../components/dashboard/TimeRangePicker";

// Step (in indices) between labeled x-axis ticks. Sized so each range
// produces roughly 5-7 labels at the chart's actual width — fewer steps
// at long ranges where individual days don't matter.
const STEP_BY_RANGE: Record<TimeRangeKey, number> = {
  "7d": 1,
  "2w": 3,
  "30d": 7,
  "3mo": 15,
  "6mo": 30,
  "1y": 60,
};

// Indices in [0, length) that should render an x-axis tick label.
// First and last are always included; intermediate labels follow the
// per-range step rule, with one exception — any intermediate that
// falls within step/2 of an endpoint is dropped to keep its label
// from colliding with the always-shown first or last label.
export function xAxisLabelIndices(
  range: TimeRangeKey,
  length: number,
): Set<number> {
  const out = new Set<number>();
  if (length <= 0) return out;
  const step = STEP_BY_RANGE[range];
  const lastIdx = length - 1;
  const dropThreshold = step / 2;
  for (let i = step; i < lastIdx; i += step) {
    // i is at least one full step from 0; only the trailing end
    // can collide with the always-added last label.
    if (lastIdx - i < dropThreshold) continue;
    out.add(i);
  }
  out.add(0);
  out.add(lastIdx);
  return out;
}
