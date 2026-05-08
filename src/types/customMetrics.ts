export type CustomMetricType = "wellness" | "performance";
export type CustomMetricInputType = "numeric" | "radio";

export interface CustomMetricDef {
  id: string;
  ownerId: string;
  name: string;
  metricType: CustomMetricType;
  inputType: CustomMetricInputType;
  unit: string;
  goalRaw: number;
  yTopRaw: number;
  yBottomRaw: number;
  avgDecimals: number;
  createdAt: number;
  updatedAt: number;
}
