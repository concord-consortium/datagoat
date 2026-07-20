import { MetricInputRow } from "./MetricInputRow";
import type { HealthSummary } from "./useHealthSummaries";
import { metricRendersRow, type TrackedMetric } from "./useTrackedMetrics";
import { customAsMetricDefinition } from "../../metrics/customMetricDefinition";
import { getMetricValue } from "../../metrics/metricAccessor";
import { isYesNoLevels } from "../../metrics/yesNo";
import type { CompetitionEntry, HealthEntry, PerformanceEntry } from "../../types/data";
import { parseNumericInput } from "../../utils/numericInput";

export interface LogMetricRowProps {
  tracked: TrackedMetric;
  healthEntry: HealthEntry;
  performanceEntry: PerformanceEntry;
  competitionEntry: CompetitionEntry;
  summary: HealthSummary;
  summaryCell: string;
  competitionTerm: string;
  // Scalar write for every metric type (already date-bound by the parent).
  setValue: (value: number | string | undefined) => void;
  // Availability tree write - the one non-scalar health widget - date-bound.
  setAvailability: (next: HealthEntry["availability"]) => void;
}

// One row dispatcher for every metric type. Reads the value through the
// accessor, resolves the widget by metric identity/primitive, and renders the
// shared MetricInputRow body. Health-only widgets (hydration color scale,
// availability tree, the relativeProteinIntake placeholder) are keyed on metric
// id. Built-in ordinals always render as scale cards; only custom ordinals
// choose radio vs scale cards.
export function LogMetricRow(props: LogMetricRowProps) {
  const { tracked, summary, summaryCell, competitionTerm, setValue, setAvailability } = props;

  if (!metricRendersRow(tracked)) return null;

  const entry =
    tracked.type === "health"
      ? props.healthEntry
      : tracked.type === "performance"
        ? props.performanceEntry
        : props.competitionEntry;
  const metric =
    tracked.builtInDef ?? customAsMetricDefinition(tracked.customDef!, tracked.type);
  const detailHref = `/${tracked.type}/${tracked.id}`;
  const value = getMetricValue(tracked, entry);
  const numberValue = typeof value === "number" && Number.isFinite(value) ? value : undefined;

  // First cell: health shows its sparkline + 7-day average; perf/comp show the
  // pre-formatted summaryCell string with no sparkline. Preserves the two
  // per-type looks until the Summary-semantics story revisits them.
  const firstCell: HealthSummary =
    tracked.type === "health" ? summary : { avgLabel: summaryCell };

  if (tracked.type === "health" && tracked.id === "hydration") {
    return (
      <MetricInputRow
        {...firstCell}
        metric={metric}
        inputType="colorScale"
        value={numberValue}
        onChange={(level) => setValue(level)}
        detailHref={detailHref}
      />
    );
  }
  if (tracked.type === "health" && tracked.id === "availability") {
    return (
      <MetricInputRow
        metric={metric}
        inputType="tree"
        competitionTerm={competitionTerm}
        value={props.healthEntry.availability}
        onChange={(next) => setAvailability(next)}
        detailHref={detailHref}
      />
    );
  }
  if (tracked.type === "health" && tracked.id === "relativeProteinIntake") {
    return <MetricInputRow metric={metric} inputType="placeholder" detailHref={detailHref} />;
  }

  if (tracked.builtInDef?.inputType === "ordinal" && tracked.builtInDef.levels) {
    return (
      <MetricInputRow
        {...firstCell}
        metric={metric}
        inputType="ordinal"
        levels={tracked.builtInDef.levels}
        value={numberValue}
        onChange={(next) => setValue(next)}
        detailHref={detailHref}
      />
    );
  }
  if (tracked.customDef?.primitive === "ordinal" && tracked.customDef.levels) {
    const levels = tracked.customDef.levels;
    return (
      <MetricInputRow
        {...firstCell}
        metric={metric}
        inputType={isYesNoLevels(levels) ? "radio" : "ordinal"}
        levels={levels}
        value={numberValue}
        onChange={(next: number) => setValue(next)}
        detailHref={detailHref}
      />
    );
  }

  const stringValue =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value
        : "";
  return (
    <MetricInputRow
      {...firstCell}
      metric={metric}
      inputType="numeric"
      value={stringValue}
      onChange={(raw) => {
        const next = parseNumericInput(raw);
        if (next === null) return;
        setValue(next);
      }}
      detailHref={detailHref}
      allowNegative={(tracked.customDef?.yBottomRaw ?? 0) < 0}
    />
  );
}
