// A per-user override of a metric's goal value and / or chart y-axis
// bounds. One document per (user, metric), stored at
//   /users/{uid}/metricOverrides/{metricId}
// so Firestore enforces one-doc-per-metric via id uniqueness within the
// subcollection. The doc never carries metric definition data (name,
// unit, ...) — that lives in code today and could move to Firestore
// later without breaking these documents.
//
// Naming note: this is called `metricOverrides`, not
// `builtinMetricOverrides`. Today the feature only edits built-in
// metric goals/axes, but the override shape (partial goal + axis
// fields) is generic and could later apply to custom metrics too.
// Avoid `builtin` in identifiers to keep that door open.
import type { MetricSchedule } from "./metricSchedule";

export interface MetricOverride {
  id: string;
  ownerId: string;
  metricId: string;
  goalRaw?: number;
  yTopRaw?: number;
  yBottomRaw?: number;
  // Per-user override of the metric's schedule (built-in default or
  // custom-def value). Absent => fall back to the metric's own schedule.
  schedule?: MetricSchedule;
  // ms epoch; provider-managed via server timestamps.
  createdAt: number;
  updatedAt: number;
}
