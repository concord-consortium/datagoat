import type { MetricDefinition } from "./types";

// Built-in Performance metrics that are ON by default.
//
// Per the DGT-51 design source ("H&P: Perf" rows of the Metrics tab),
// every Performance metric is OFF by default. Users opt in via the
// AddMetric flow, which reads from ADDABLE_PERFORMANCE. The empty
// array here is intentional and is what makes the Performance Log
// render an empty-state CTA on first visit.
//
// If a future revision flips a Performance metric to default-on, it
// gets moved from ADDABLE_PERFORMANCE to this array. No other code
// path needs to change — Dashboard, PerformanceLog, MetricDetail, and
// CODAP all consume this registry.
//
// Note: For demo/CODAP export testing, one sample metric is included
// so generated demo datasets have values to export. This metric is
// present only for test/demo purposes and should be moved to
// ADDABLE_PERFORMANCE if/when demo mode is retired.
export const PERFORMANCE_METRICS: MetricDefinition[] = [
  {
    id: "oneRepMaxSquat",
    name: "1 Rep Max Squat",
    unit: "kg or lbs",
    type: "performance",
    whoCollects: "Self, S&C (Strength & Conditioning Coach)",
    howCollected: "Total load in lbs or kgs.",
    description:
      "The maximum load achievable for 1 repetition of barbell back squat through a full range of motion.",
    inputType: "numeric",
  },
];
