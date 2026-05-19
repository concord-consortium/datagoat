// A per-user override of a metric's goal value and / or chart y-axis
// bounds. One document per (user, metric) — the Firestore doc id is
// the deterministic key `${ownerId}_${metricId}`. The document never
// stores any of the metric's definition data (name, unit, ...), so it
// stays correct if built-in metric definitions later move to the DB.
export interface MetricOverride {
  id: string;
  ownerId: string;
  metricId: string;
  goalRaw?: number;
  yTopRaw?: number;
  yBottomRaw?: number;
  // ms epoch; provider-managed via server timestamps.
  createdAt: number;
  updatedAt: number;
}
