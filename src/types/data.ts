import { CURRENT_HEALTH_ENTRY_VERSION } from "../migrations/healthEntry";
import { CURRENT_COMPETITION_ENTRY_VERSION } from "../migrations/competitionEntry";

export interface HealthEntry {
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
  // User-defined custom health metric values, keyed by CustomMetricDef.id.
  // Optional so existing entries without the field read fine. Matches the
  // CompetitionEntry.metrics pattern for non-typed values.
  customMetrics?: Record<string, number | string>;
}

export interface CompetitionEntry {
  version: number;
  date: string;
  metrics: Record<string, number | string>;
}

export type DataLoadState<T> =
  | { status: "loading" }
  | { status: "loaded"; entries: T[] };

export function emptyHealthEntry(date: string): HealthEntry {
  return {
    version: CURRENT_HEALTH_ENTRY_VERSION,
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

export function emptyCompetitionEntry(date: string): CompetitionEntry {
  return {
    version: CURRENT_COMPETITION_ENTRY_VERSION,
    date,
    metrics: {},
  };
}
