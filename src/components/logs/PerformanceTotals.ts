import type { PerformanceEntry } from "../../types/data";
import { HISTORY, dateOffsetFromISO } from "../../utils/dates";

// Per-metric sum over the visible HISTORY window. Skips entries whose
// date falls outside [0, HISTORY] (matches the date-nav range so the
// totals column is consistent with the rest of the screen). Only numeric
// values contribute; non-numeric stored values (e.g., a future "best
// time" string metric) are skipped here and will require their own
// aggregation rule when the designer-final metric set lands.
//
// User-configurable totals window (per-season / all-time / monthly) is
// filed as deferred work in requirements.md.
export function performanceTotal(
  entries: PerformanceEntry[],
  metricId: string,
): number {
  let total = 0;
  for (const entry of entries) {
    const offset = dateOffsetFromISO(entry.date);
    if (Number.isNaN(offset) || offset < 0 || offset > HISTORY) continue;
    const raw = entry.metrics?.[metricId];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      total += raw;
    }
  }
  return total;
}
