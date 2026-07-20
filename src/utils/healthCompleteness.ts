import {
  availabilityFilled,
  NAMED_HEALTH_FIELDS,
  scalarFilled,
  type HealthNamedField,
} from "../metrics/metricAccessor";
import type { HealthEntry } from "../types/data";

export type ChipState = "all" | "some" | "none";

// Per spec: "All" = every tracked metric has a non-empty value;
// "Some" = at least one has a value; "None" = all empty.
//
// trackedMetricIds is the caller's currently-tracked metric ids
// (e.g., ["hydration", "sleepTime", ...]). Metrics not in the tracked
// list are skipped entirely from completeness.
//
// Chip state from an arbitrary set of metric ids and a "is this one filled"
// predicate. Entry-shape agnostic, so a page spanning health named fields,
// performance maps, and competition maps can share one chip.
export function getChipStateBy(
  trackedMetricIds: string[],
  isFilled: (id: string) => boolean,
): ChipState {
  if (trackedMetricIds.length === 0) return "none";
  let filledCount = 0;
  for (const id of trackedMetricIds) {
    if (isFilled(id)) filledCount++;
  }
  if (filledCount === 0) return "none";
  if (filledCount === trackedMetricIds.length) return "all";
  return "some";
}

// Health-only convenience wrapper. Kept because the activity calendar and
// the dashboard's per-day "was this logged" probe are health-scoped by
// design, not by omission.
export function getChipState(
  entry: HealthEntry | null,
  trackedMetricIds: string[],
): ChipState {
  return getChipStateBy(trackedMetricIds, (id) => isHealthFieldFilled(entry, id));
}

// One filled-check for every health field, on the accessor's shared core:
// availability delegates to the tree check, the five named built-ins and every
// custom go through scalarFilled. A null entry, or an absent / undefined value,
// is "not logged."
export function isHealthFieldFilled(entry: HealthEntry | null, id: string): boolean {
  if (!entry) return false;
  if (id === "availability") return availabilityFilled(entry);
  const value = (NAMED_HEALTH_FIELDS as readonly string[]).includes(id)
    ? entry[id as HealthNamedField]
    : entry.customMetrics?.[id];
  return scalarFilled(value);
}
