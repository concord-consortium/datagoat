import { useMemo } from "react";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import { useMetricOverrides } from "../../contexts/MetricOverridesContext";
import { useUser } from "../../contexts/UserContext";
import { ADDABLE_COMPETITION, ADDABLE_HEALTH, ADDABLE_PERFORMANCE } from "../../metrics/addableMetrics";
import { COMPETITION_METRICS } from "../../metrics/competitionMetrics";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import { sectionFor, type SectionKey } from "../../metrics/logSections";
import type { MetricDefinition } from "../../metrics/types";
import type { CustomMetricDef } from "../../types/customMetrics";
import { resolveSchedule, type MetricSchedule } from "../../types/metricSchedule";

export type MetricType = "health" | "performance" | "competition";

export interface TrackedMetric {
  id: string;
  name: string;
  type: MetricType;
  section: SectionKey;
  // Resolved schedule (own schedule merged with any user override), the same
  // value `section` is derived from. Carried through so callers can ask the
  // due-today engine whether the metric is scheduled on a given date without
  // re-resolving it. The hook always sets it; optional only so lightweight
  // row-test fixtures that don't exercise scheduling can omit it.
  schedule?: MetricSchedule;
  // Exactly one of these is set. The row dispatcher branches on which.
  builtInDef?: MetricDefinition;
  customDef?: CustomMetricDef;
}

// Built-in lookup per type, spanning default-on and addable registries.
// Default-on vs default-off is a property of the tracked-id list, not of
// this map, so both go in.
const DEFS_BY_TYPE: Record<MetricType, MetricDefinition[]> = {
  health: [...HEALTH_METRICS, ...ADDABLE_HEALTH],
  performance: [...PERFORMANCE_METRICS, ...ADDABLE_PERFORMANCE],
  competition: [...COMPETITION_METRICS, ...ADDABLE_COMPETITION],
};

const BUILT_IN_BY_ID: Record<MetricType, Map<string, MetricDefinition>> = {
  health: new Map(DEFS_BY_TYPE.health.map((m) => [m.id, m])),
  performance: new Map(DEFS_BY_TYPE.performance.map((m) => [m.id, m])),
  competition: new Map(DEFS_BY_TYPE.competition.map((m) => [m.id, m])),
};

// Flattens the three tracked-id arrays into one section-tagged list.
//
// Order is health, then performance, then competition, each preserving the
// user's drag-order from /setup/tracking. The tracked arrays are
// semantically ordered, so iterating them (rather than registry order) is
// what honors a custom metric dragged among the built-ins.
export function useTrackedMetrics(): TrackedMetric[] {
  const { loadState } = useUser();
  const { metrics: allCustom } = useCustomMetrics();
  const { getOverride } = useMetricOverrides();

  const profile = loadState.status === "loaded" ? loadState.profile : null;

  return useMemo(() => {
    const trackedByType: Record<MetricType, string[]> = {
      health: profile?.trackedHealthMetrics ?? HEALTH_METRICS.map((m) => m.id),
      performance:
        profile?.trackedPerformanceMetrics ?? PERFORMANCE_METRICS.map((m) => m.id),
      competition:
        profile?.trackedCompetitionMetrics ?? COMPETITION_METRICS.map((m) => m.id),
    };

    // Index customs once by "type:id" so the tracked-id loop below is a Map
    // lookup, not an allCustom.find() scan per id (which was O(tracked * customs)).
    const customByTypeId = new Map<string, CustomMetricDef>();
    for (const m of allCustom) customByTypeId.set(`${m.metricType}:${m.id}`, m);

    const out: TrackedMetric[] = [];
    for (const type of ["health", "performance", "competition"] as const) {
      for (const id of trackedByType[type]) {
        const builtInDef = BUILT_IN_BY_ID[type].get(id);
        const customDef = builtInDef ? undefined : customByTypeId.get(`${type}:${id}`);
        // A tracked id resolving to neither is a stale entry from a deleted
        // custom that has not been pruned yet. Skip it rather than render a
        // broken row.
        if (!builtInDef && !customDef) continue;
        const schedule = resolveSchedule(
          builtInDef?.schedule ?? customDef?.schedule,
          getOverride(id)?.schedule,
        );
        out.push({
          id,
          name: builtInDef?.name ?? customDef?.name ?? id,
          type,
          section: sectionFor(schedule),
          schedule,
          builtInDef,
          customDef,
        });
      }
    }
    return out;
  }, [profile, allCustom, getOverride]);
}
