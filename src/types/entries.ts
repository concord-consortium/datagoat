import type { Timestamp } from "firebase/firestore";

export interface MetricEntry {
  value: number;
  tags?: string[];
  updatedAt: Timestamp;
}

export interface BodyEntry {
  schemaVersion: number;
  date: string; // YYYY-MM-DD
  metrics: Record<string, MetricEntry>;
}

export interface OutcomeEntry {
  schemaVersion: number;
  date: string;
  metrics: Record<string, MetricEntry>;
}
