export type MetricType = "wellness" | "performance";
export type MetricInputType = "numeric" | "radio" | "tree" | "colorScale";

export interface MetricDefinition {
  id: string;
  name: string;
  // Long-form unit ("hr/night", "g/kg/day"). MetricDetail / info screens
  // render this; the log's record-input column renders displayUnit when
  // present, falling back to unit.
  unit: string;
  displayUnit?: string;
  // Per-metric hint rendered below the record-input on the log screen.
  // E.g., Lean Mass: "Entered 2-3×/yr".
  hint?: string;
  type: MetricType;
  whoCollects: string;
  howCollected: string;
  description: string;
  min?: number;
  max?: number;
  inputType: MetricInputType;
}
