import type { MetricDefinition } from "./types";

// Placeholder addable lists ported from the prototype's `addableWellnessMetrics`
// / `addablePerformanceMetrics` arrays (both populated with 10 generic
// placeholder entries pending designer-final additions). Consumers (AddMetric
// screen) read from this registry; the designer-final list lands as a single-
// file swap when ready.
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
