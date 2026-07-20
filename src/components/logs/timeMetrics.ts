import { getMetricChartConfig } from "../../charts/metricChartConfig";

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
