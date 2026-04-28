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
}

export interface PerformanceEntry {
  version: number;
  date: string;
  metrics: Record<string, number | string>;
}

export type DataLoadState<T> =
  | { status: "loading" }
  | { status: "loaded"; entries: T[] };
