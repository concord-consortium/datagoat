import type { CompetitionEntry, HealthEntry } from "../types/data";

// Returns true when at least one entry has a finite numeric value
// (including 0 and negatives) or a non-empty string value for the given
// metric ID. A missing / undefined key means "not logged."
//
// Scope: this looks at health entries' `customMetrics` map and
// competition entries' `metrics` map only. Built-in HealthEntry fields
// (`hydration`, `sleepTime`, `sleepEfficiency`, `protein`, `leanMass`,
// `availability`) are stored as direct fields on HealthEntry, not in
// `customMetrics`, so this helper does NOT find them - it's intended
// for custom-health-metric IDs and competition-metric IDs (built-in or
// custom; competition metrics all share one map).
//
// Backs the "you have entries - really untrack this metric?" confirmation
// dialog (custom metrics) and the CompetitionLog total cell.
export function hasEntriesForMetric(
  metricId: string,
  healthEntries: HealthEntry[],
  competitionEntries: CompetitionEntry[],
): boolean {
  for (const entry of healthEntries) {
    const v = entry.customMetrics?.[metricId];
    if (isMeaningful(v)) return true;
  }
  for (const entry of competitionEntries) {
    const v = entry.metrics?.[metricId];
    if (isMeaningful(v)) return true;
  }
  return false;
}

function isMeaningful(v: number | string | undefined): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") return v.trim() !== "";
  return false;
}
