import { CompetitionMetricInput } from "./CompetitionMetricInput";
import { TimeInput } from "./TimeInput";
import { customAsMetricDefinition } from "../../metrics/customMetricDefinition";
import { getMetricChartConfig } from "../../charts/metricChartConfig";
import type { MetricDefinition } from "../../metrics/types";
import type { CustomMetricDef } from "../../types/customMetrics";

// Seconds precision for a metric's TimeInput, read from its chart config
// (avgDecimals doubles as the seconds precision). One source so every log
// renders a given metric's seconds field at the same precision.
export function timeSecondsDecimals(metricId: string): number {
  return getMetricChartConfig(metricId).avgDecimals ?? 2;
}

// The single "render this metric as a time value?" predicate. The log's
// Total/Latest column and its Record input both consult it, so they can't
// disagree about a metric's time-ness.
export function isTimeMetric(metricId: string): boolean {
  return getMetricChartConfig(metricId).timeLayout != null;
}

interface LogRecordInputProps {
  metricId: string;
  metricType: "competition" | "performance";
  builtInDef?: MetricDefinition;
  customDef?: CustomMetricDef;
  value: string;
  filled: boolean;
  onChange: (raw: string) => void;
  labelledBy: string;
  allowNegative: boolean;
}

// Chooses the Record-cell control for a competition/performance log row:
// the multi-field TimeInput for time metrics, else the numeric input.
// Shared by CompetitionLog and PerformanceLog so the time-routing (build
// MetricDefinition -> gate -> seconds precision) lives in one place.
export function LogRecordInput({
  metricId,
  metricType,
  builtInDef,
  customDef,
  value,
  filled,
  onChange,
  labelledBy,
  allowNegative,
}: LogRecordInputProps) {
  const timeMeta =
    builtInDef ??
    (customDef ? customAsMetricDefinition(customDef, metricType) : undefined);
  if (timeMeta && isTimeMetric(metricId)) {
    return (
      <TimeInput
        metric={timeMeta}
        value={value}
        onChange={onChange}
        labelledBy={labelledBy}
        secondsDecimals={timeSecondsDecimals(metricId)}
      />
    );
  }
  return (
    <CompetitionMetricInput
      metricId={metricId}
      labelledBy={labelledBy}
      value={value}
      filled={filled}
      onChange={onChange}
      allowNegative={allowNegative}
    />
  );
}
