import type { PerformanceEntry, WellnessEntry } from "../types/data";

// Returns true when at least one wellness or performance entry has a
// non-zero numeric value (or non-empty string value) for the given
// metric ID. Custom wellness metric values live in
// WellnessEntry.customMetrics; custom performance metric values share
// the existing PerformanceEntry.metrics map alongside built-in IDs.
//
// "0 is the sentinel for blank input" is the existing convention in
// WellnessLog / PerformanceLog — both write 0 to the map when the user
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
  wellnessEntries: WellnessEntry[],
  performanceEntries: PerformanceEntry[],
): boolean {
  for (const entry of wellnessEntries) {
    const v = entry.customMetrics?.[metricId];
    if (isMeaningful(v)) return true;
  }
  for (const entry of performanceEntries) {
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
