import type { MetricDefinition } from "./types";

// Built-in Performance metrics that are ON by default.
//
// Per the DGT-51 design source ("H&P: Perf" rows of the Metrics tab),
// every Performance metric is OFF by default. Users opt in via the
// AddMetric flow, which reads from ADDABLE_PERFORMANCE. The empty
// array here is intentional and is what makes the metrics log's
// Performance section render its empty state on first visit.
//
// If a future revision flips a Performance metric to default-on, it
// gets moved from ADDABLE_PERFORMANCE to this array. No other code
// path needs to change — Dashboard, MetricsDataEntryLog, MetricDetail,
// and CODAP all consume this registry.
export const PERFORMANCE_METRICS: MetricDefinition[] = [];
