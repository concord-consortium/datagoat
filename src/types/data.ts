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
  // Availability is a tree, not a scalar. Each sub-key is optional;
  // a missing key means "not answered." `practiceHeld` / `gameHeld`
  // can be `true` or `false`; both are valid answered states.
  // Participation sub-keys mirror that shape: `true` = participated
  // ("played"), `false` = did not ("dnp"). The CODAP export maps
  // those booleans back to the prototype's "played"/"dnp" strings at
  // the formatting boundary. Participation is only meaningful when
  // its `*Held` parent is `true` - AvailabilityTree clears it via
  // undefined when the parent flips to false.
  availability: {
    practiceHeld?: boolean;
    practiceParticipation?: boolean;
    gameHeld?: boolean;
    gameParticipation?: boolean;
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
    // availability sub-keys are intentionally omitted - absence is
    // the canonical "not answered" state.
    availability: {},
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
