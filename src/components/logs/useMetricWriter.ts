import { useCallback } from "react";
import { useData } from "../../contexts/DataContext";
import { resolveWrite } from "../../metrics/metricAccessor";
import type { CompetitionEntry, HealthEntry, PerformanceEntry } from "../../types/data";
import type { TrackedMetric } from "./useTrackedMetrics";

// The write half of the metric accessor. resolveWrite (pure) decides the slice
// and partial; this hook only wires the slice to the matching DataContext
// setter. Parsing raw input to a typed value stays in the row/widget layer -
// setMetricValue takes an already-typed value, and undefined flows through to
// the delete sentinel.
export function useMetricWriter() {
  const { setHealthEntry, setPerformanceEntry, setCompetitionEntry } = useData();

  const setMetricValue = useCallback(
    (tracked: TrackedMetric, dateIso: string, value: number | string | undefined) => {
      const { slice, partial } = resolveWrite(tracked, value);
      switch (slice) {
        case "health":
          setHealthEntry(dateIso, partial as Partial<HealthEntry>);
          return;
        case "performance":
          setPerformanceEntry(dateIso, partial as Partial<PerformanceEntry>);
          return;
        case "competition":
          setCompetitionEntry(dateIso, partial as Partial<CompetitionEntry>);
          return;
      }
    },
    [setHealthEntry, setPerformanceEntry, setCompetitionEntry],
  );

  return { setMetricValue };
}
