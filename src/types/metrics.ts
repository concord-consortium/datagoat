import type { Sport } from "./profile";

export type InputType =
  | "numeric"
  | "color-scale"
  | "scale-1-5"
  | "scale-1-10"
  | "binary";

export type MetricCategory = "body" | "training" | "outcome";

export interface MetricDefinition {
  id: string;
  name: string;
  unit: string;
  inputType: InputType;
  category: MetricCategory;
  min?: number;
  max?: number;
  description: string;
  learnMoreUrl?: string;
  schemaVersion: number;
}

export interface SportDefaults {
  sport: Sport;
  defaultBodyMetrics: string[];
  defaultTrainingMetrics: string[];
  defaultOutcomeMetrics: string[];
  schemaVersion: number;
}

export interface UserMetricConfig {
  selectedMetricIds: string[];
  schemaVersion: number;
}

export interface CustomMetric {
  id: string;
  name: string;
  unit: string;
  inputType: "numeric" | "scale-1-10" | "binary";
  trackByDate?: boolean;
  min?: number;
  max?: number;
  schemaVersion: number;
}
