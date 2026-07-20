import type { TrackedMetric } from "../components/logs/useTrackedMetrics";
import type { CompetitionEntry, HealthEntry, PerformanceEntry } from "../types/data";

// The five health built-ins stored as named fields on HealthEntry. Every
// other health metric (built-in Mood, all customs) lives in the customMetrics
// map. This list is the whole difference between the two health storage kinds,
// and the seam that collapses when storage is later unified.
export type HealthNamedField =
  | "hydration"
  | "sleepTime"
  | "sleepEfficiency"
  | "protein"
  | "leanMass";

export const NAMED_HEALTH_FIELDS: readonly HealthNamedField[] = [
  "hydration",
  "sleepTime",
  "sleepEfficiency",
  "protein",
  "leanMass",
];

export type MetricEntry = CompetitionEntry | HealthEntry | PerformanceEntry;

// Where a metric's scalar value is stored. availability is not a scalar and is
// never routed through here (isMetricFilled and the availability widget handle
// it directly).
export type StorageLoc =
  | { kind: "healthNamed"; field: HealthNamedField }
  | { kind: "healthCustom" }
  | { kind: "map" };

export function resolveStorage(tracked: TrackedMetric): StorageLoc {
  if (tracked.type === "health") {
    if ((NAMED_HEALTH_FIELDS as readonly string[]).includes(tracked.id)) {
      return { kind: "healthNamed", field: tracked.id as HealthNamedField };
    }
    return { kind: "healthCustom" };
  }
  return { kind: "map" };
}

export function getMetricValue(
  tracked: TrackedMetric,
  entry: MetricEntry,
): number | string | undefined {
  const loc = resolveStorage(tracked);
  switch (loc.kind) {
    case "healthNamed":
      return (entry as HealthEntry)[loc.field];
    case "healthCustom":
      return (entry as HealthEntry).customMetrics?.[tracked.id];
    case "map":
      return (entry as CompetitionEntry | PerformanceEntry).metrics?.[tracked.id];
  }
}

// One filled-definition shared by the chip resolver, the row components, and
// the health-only dashboard chips: a finite number (including 0 and negatives)
// or a non-empty trimmed string. Absent / undefined means "not logged."
export function scalarFilled(value: number | string | undefined): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim() !== "";
  return false;
}
