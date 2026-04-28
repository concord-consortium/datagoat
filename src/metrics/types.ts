export type MetricType = "wellness" | "performance";
export type MetricInputType = "numeric" | "radio" | "tree" | "colorScale";

export interface MetricDefinition {
  id: string;
  name: string;
  unit: string;
  type: MetricType;
  whoCollects: string;
  howCollected: string;
  description: string;
  min?: number;
  max?: number;
  inputType: MetricInputType;
}
