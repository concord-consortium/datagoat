import type { MetricDefinition } from "./types";

// Verbatim port of the prototype's `addableWellnessMetrics` /
// `addablePerformanceMetrics` arrays (datagoat-2026-04-27.html lines
// 8180-8185), which themselves are a synthetic loop of 10 placeholder
// entries per type pending designer-final additions. The prototype source
// carries only `id` and `name`; `whoCollects` / `howCollected` /
// `description` are empty strings because the source has nothing to port.
// Consumers (AddMetric screen) read from this registry; the designer-final
// list lands as a single-file swap when ready (see requirements.md
// "Deferred Work: Designer-final addable-metric set").
function buildPlaceholders(
  type: "wellness" | "performance",
): MetricDefinition[] {
  const out: MetricDefinition[] = [];
  for (let i = 1; i <= 10; i++) {
    out.push({
      id: `${type}-custom-${i}`,
      name: `${type === "wellness" ? "Wellness" : "Performance"} Metric${i}`,
      unit: "",
      type,
      whoCollects: "",
      howCollected: "",
      description: "",
      inputType: "numeric",
    });
  }
  return out;
}

export const ADDABLE_WELLNESS: MetricDefinition[] = buildPlaceholders("wellness");
export const ADDABLE_PERFORMANCE: MetricDefinition[] =
  buildPlaceholders("performance");
