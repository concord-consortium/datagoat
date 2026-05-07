import type { TimeRangeKey } from "../components/dashboard/TimeRangePicker";

// Step (in indices) between labeled x-axis ticks. Per the chart spec:
//   7d  → 1, 2w → 3, 30d → 7, 3mo / 6mo / 1y → 15
const STEP_BY_RANGE: Record<TimeRangeKey, number> = {
  "7d": 1,
  "2w": 3,
  "30d": 7,
  "3mo": 15,
  "6mo": 15,
  "1y": 15,
};

// Indices in [0, length) that should render an x-axis tick label.
// First and last are always included; intermediate indices follow the
// per-range step rule. Returning a Set lets the chart do O(1) checks
// during render without re-running the math per bar.
export function xAxisLabelIndices(
  range: TimeRangeKey,
  length: number,
): Set<number> {
  const out = new Set<number>();
  if (length <= 0) return out;
  const step = STEP_BY_RANGE[range];
  for (let i = 0; i < length; i += step) out.add(i);
  out.add(0);
  out.add(length - 1);
  return out;
}
