import { CURRENT_WELLNESS_ENTRY_VERSION } from "../migrations/wellnessEntry";
import { CURRENT_PERFORMANCE_ENTRY_VERSION } from "../migrations/performanceEntry";

export interface WellnessEntry {
  version: number;
  date: string;
  hydration: number;
  sleepTime: number;
  sleepEfficiency: number;
  protein: number;
  leanMass: number;
  availability: {
    practiceHeld: boolean | null;
    practiceParticipation: "played" | "dnp" | null;
    gameHeld: boolean | null;
    gameParticipation: "played" | "dnp" | null;
  };
  // User-defined custom wellness metric values, keyed by CustomMetricDef.id.
  // Optional so existing entries without the field read fine. Matches the
  // PerformanceEntry.metrics pattern for non-typed values.
  customMetrics?: Record<string, number | string>;
}

export interface PerformanceEntry {
  version: number;
  date: string;
  metrics: Record<string, number | string>;
}

export type DataLoadState<T> =
  | { status: "loading" }
  | { status: "loaded"; entries: T[] };

export function emptyWellnessEntry(date: string): WellnessEntry {
  return {
    version: CURRENT_WELLNESS_ENTRY_VERSION,
    date,
    hydration: 0,
    sleepTime: 0,
    sleepEfficiency: 0,
    protein: 0,
    leanMass: 0,
    availability: {
      practiceHeld: null,
      practiceParticipation: null,
      gameHeld: null,
      gameParticipation: null,
    },
  };
}

export function emptyPerformanceEntry(date: string): PerformanceEntry {
  return {
    version: CURRENT_PERFORMANCE_ENTRY_VERSION,
    date,
    metrics: {},
  };
}
