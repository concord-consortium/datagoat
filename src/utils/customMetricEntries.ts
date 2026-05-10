import type { CompetitionEntry, HealthEntry } from "../types/data";

// Returns true when at least one health or competition entry has a
// non-zero numeric value (or non-empty string value) for the given
// metric ID. Custom health metric values live in
// HealthEntry.customMetrics; custom competition metric values share
// the existing CompetitionEntry.metrics map alongside built-in IDs.
//
// "0 is the sentinel for blank input" is the existing convention in
// HealthLog / CompetitionLog — both write 0 to the map when the user
// leaves the input empty. Treating 0 as "logged" would cause the
// confirmation dialog to fire for every metric the user ever touched.
//
// FUTURE WORK: This convention is brittle. A real "0 alcoholic drinks"
// or "0 minutes stretched" entry is currently indistinguishable from
// "user never typed anything." When the log screens are updated to
// store `undefined` (or omit the key) for blank inputs and reserve `0`
// for genuine zero values, this helper should switch to key-presence
// detection (`metricId in entry.customMetrics`) instead.
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
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.trim() !== "";
  return false;
}
