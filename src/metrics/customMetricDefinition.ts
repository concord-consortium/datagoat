import type { MetricDefinition } from "./types";
import type { CustomMetricDef } from "../types/customMetrics";

// Adapt a CustomMetricDef into the MetricDefinition shape that the
// metric list / detail / chart code renders. Built-in-only fields
// (whoCollects, howCollected, description) stay empty - they aren't read
// for custom metrics. Shared by MetricDetail and TrackedDataSetup so the
// two adapters can't drift (previously one forwarded `schedule` and the
// other silently dropped it). Callers that may not have a metric guard
// undefined themselves before calling.
export function customAsMetricDefinition(
  def: CustomMetricDef,
  type: "health" | "performance" | "competition",
): MetricDefinition {
  return {
    id: def.id,
    name: def.name,
    unit: def.unit ?? "",
    displayUnit: def.unit ?? "",
    type,
    whoCollects: "",
    howCollected: "",
    description: "",
    inputType: def.inputType,
    learnMoreUrl: def.referenceUrl || undefined,
    schedule: def.schedule,
  };
}
