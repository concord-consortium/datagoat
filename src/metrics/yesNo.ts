import type { CustomMetricLevel } from "../types/customMetrics";

// The canonical Y/N preset levels. A Y/N custom metric is stored as an ordinal
// with exactly these two levels (No=0, Yes=1) — there is no separate stored
// flag — so `isYesNoLevels` recognizes it by this shape.
export const YN_LEVELS: CustomMetricLevel[] = [
  { label: "No", value: 0 },
  { label: "Yes", value: 1 },
];

// True when a metric's levels are the canonical Y/N preset. Such metrics render
// as a Yes/No radio group rather than the scale-card picker. A user would have
// to hand-build a 2-value scale labelled exactly No/Yes at 0/1 to collide, and
// rendering that as a Yes/No radio is acceptable.
export function isYesNoLevels(levels: CustomMetricLevel[] | undefined): boolean {
  return (
    !!levels &&
    levels.length === 2 &&
    levels[0]?.value === 0 &&
    levels[0]?.label === "No" &&
    levels[1]?.value === 1 &&
    levels[1]?.label === "Yes"
  );
}
