import { CURRENT_HEALTH_ENTRY_VERSION } from "../migrations/healthEntry";
import { CURRENT_COMPETITION_ENTRY_VERSION } from "../migrations/competitionEntry";

export interface HealthEntry {
  version: number;
  date: string;
  // The five built-in numeric metrics. Optional so a freshly-created
  // entry can omit fields the user has not logged. `0` is a VALID value
  // (the user genuinely logged zero); `undefined` / absent means
  // "not logged." Writers translate undefined to deleteField() at the
  // Firestore boundary so cleared values are removed from the doc.
  hydration?: number;
  sleepTime?: number;
  sleepEfficiency?: number;
  protein?: number;
  leanMass?: number;
  availability: {
    practiceHeld: boolean | null;
    practiceParticipation: "played" | "dnp" | null;
    gameHeld: boolean | null;
    gameParticipation: "played" | "dnp" | null;
  };
  // User-defined custom health metric values, keyed by CustomMetricDef.id.
  // A missing key (or `undefined`) means "not logged." Stored docs never
  // contain undefined values - the Firestore writer translates undefined
  // to deleteField() before write.
  customMetrics?: Record<string, number | string | undefined>;
}

export interface CompetitionEntry {
  version: number;
  date: string;
  // Non-typed metric values per-competition. `undefined` in a write means
  // "delete this key"; the Firestore writer translates undefined to deleteField()
  // before write. Stored docs never contain undefined values.
  metrics: Record<string, number | string | undefined>;
}

export type DataLoadState<T> =
  | { status: "loading" }
  | { status: "loaded"; entries: T[] };

export function emptyHealthEntry(date: string): HealthEntry {
  return {
    version: CURRENT_HEALTH_ENTRY_VERSION,
    date,
    availability: {
      practiceHeld: null,
      practiceParticipation: null,
      gameHeld: null,
      gameParticipation: null,
    },
    // Built-in numeric fields and customMetrics are intentionally
    // omitted. Their absence is the canonical "not logged" state.
  };
}

export function emptyCompetitionEntry(date: string): CompetitionEntry {
  return {
    version: CURRENT_COMPETITION_ENTRY_VERSION,
    date,
    metrics: {},
  };
}
