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
  // Optional URL the athlete can attach to a custom metric to point at
  // the source they read about it in. Surfaced on the MetricDetail
  // page as a "Learn more about <name>" link, mirroring how built-in
  // metrics expose `learnMoreUrl`. Stored as the empty string when not
  // set so the Firestore shape is uniform.
  referenceUrl: string;
  createdAt: number;
  updatedAt: number;
}
