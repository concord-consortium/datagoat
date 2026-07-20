import { HealthMetricRow } from "./HealthMetricRow";
import { PerfCompMetricRow } from "./PerfCompMetricRow";
import type { HealthSummary } from "./useHealthSummaries";
import { metricRendersRow, type TrackedMetric } from "./useTrackedMetrics";
import { getMetricValue } from "../../metrics/metricAccessor";
import type { CompetitionEntry, HealthEntry, PerformanceEntry } from "../../types/data";

export interface LogMetricRowProps {
  tracked: TrackedMetric;
  healthEntry: HealthEntry;
  performanceEntry: PerformanceEntry;
  competitionEntry: CompetitionEntry;
  summary: HealthSummary;
  summaryCell: string;
  competitionTerm: string;
  setHealth: (partial: Partial<HealthEntry>) => void;
  setHealthValue: (value: number | string | undefined) => void;
  setPerformance: (raw: string) => void;
  setCompetition: (raw: string) => void;
}

// The one seam between the two row families.
//
// Health rows and performance/competition rows keep separate widget
// dispatchers because their inputs genuinely differ: health has named-field
// built-ins plus the availability tree and the hydration color scale, none of
// which have a performance/competition analogue. Unifying them is a follow-up
// with its own story, not a precondition for grouping rows by frequency.
export function LogMetricRow(props: LogMetricRowProps) {
  const { tracked } = props;

  // Single source of truth for "does this render a row?", shared with the
  // section counter. Nominal customs (no widget in any type) render nothing.
  if (!metricRendersRow(tracked)) return null;

  if (tracked.type === "health") {
    return (
      <HealthMetricRow
        tracked={tracked}
        entry={props.healthEntry}
        summary={props.summary}
        competitionTerm={props.competitionTerm}
        setEntry={props.setHealth}
        writeValue={props.setHealthValue}
      />
    );
  }

  const entry = tracked.type === "performance" ? props.performanceEntry : props.competitionEntry;
  const setValue = tracked.type === "performance" ? props.setPerformance : props.setCompetition;

  return (
    <PerfCompMetricRow
      tracked={tracked}
      value={getMetricValue(tracked, entry)}
      summaryCell={props.summaryCell}
      setValue={setValue}
    />
  );
}
