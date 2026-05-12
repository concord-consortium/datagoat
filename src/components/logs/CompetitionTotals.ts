import type { CompetitionEntry } from "../../types/data";
import { HISTORY, historyOffsetFromISO } from "../../utils/dates";

// Win rate for the winningPercentage metric: wins / (wins + losses).
// Returns undefined when no Win/Loss entries are in window, so the
// Total cell renders blank rather than "0%" for an unstarted season.
export function winningPercentageRate(
  entries: CompetitionEntry[],
): number | undefined {
  let wins = 0;
  let losses = 0;
  for (const entry of entries) {
    const offset = historyOffsetFromISO(entry.date);
    if (Number.isNaN(offset) || offset < 0 || offset > HISTORY) continue;
    const raw = entry.metrics?.winningPercentage;
    if (raw === 1) wins++;
    else if (raw === 0) losses++;
  }
  const total = wins + losses;
  if (total === 0) return undefined;
  return Math.round((wins / total) * 100);
}

// Per-metric sum over the visible HISTORY window. Skips entries whose
// date falls outside [0, HISTORY] (matches the date-nav range so the
// totals column is consistent with the rest of the screen). Only numeric
// values contribute; non-numeric stored values (e.g., a future "best
// time" string metric) are skipped here and will require their own
// aggregation rule when the designer-final metric set lands.
//
// User-configurable totals window (per-season / all-time / monthly) is
// filed as deferred work in requirements.md.
export function competitionTotal(
  entries: CompetitionEntry[],
  metricId: string,
): number {
  let total = 0;
  for (const entry of entries) {
    const offset = historyOffsetFromISO(entry.date);
    if (Number.isNaN(offset) || offset < 0 || offset > HISTORY) continue;
    const raw = entry.metrics?.[metricId];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      total += raw;
    }
  }
  return total;
}
