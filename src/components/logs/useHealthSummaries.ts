import { useMemo } from "react";
import {
  buildAlignedSeries,
  computeAverage,
  formatMetricValue,
  lookupGoalLine,
} from "../../charts/chartSeries";
import { getMetricChartConfig, useChartConfigSync } from "../../charts/metricChartConfig";
import type { HealthEntry } from "../../types/data";

export interface HealthSummary {
  sparklineData?: Array<{ date: string; value: number | null }>;
  sparklineGoal?: number;
  avgLabel?: string;
}

// Per-metric 7-day summary (sparkline series + goal + formatted average) for
// the leftmost column of health rows, computed from the 365-day health window.
//
// Subscribes to config-overlay changes AND threads the snapshot into the memo
// deps, so a custom-metric config or goal override that registers after first
// render invalidates the memoized goal/average (matching useChartSeries).
export function useHealthSummaries(
  trackedHealthIds: string[],
  entries: HealthEntry[],
  profileKey: string,
): (id: string) => HealthSummary {
  const overlayVersion = useChartConfigSync();

  const summaries = useMemo(() => {
    const map = new Map<string, HealthSummary>();
    for (const mid of trackedHealthIds) {
      const data = buildAlignedSeries({
        type: "health",
        metricId: mid,
        healthEntries: entries,
        competitionEntries: [],
        rangeDays: 7,
      });
      const config = getMetricChartConfig(mid);
      const avg = computeAverage(data, { nullsCountAsZero: config.nullsCountAsZero });
      map.set(mid, {
        sparklineData: data,
        sparklineGoal: lookupGoalLine(mid, profileKey),
        avgLabel: avg !== undefined ? formatMetricValue(mid, avg) : undefined,
      });
    }
    return map;
  }, [entries, trackedHealthIds, profileKey, overlayVersion]);

  return (id: string) => {
    const s = summaries.get(id);
    return {
      sparklineData: s?.sparklineData,
      sparklineGoal: s?.sparklineGoal,
      avgLabel: s?.avgLabel,
    };
  };
}
