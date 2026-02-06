import type { SportDefaults } from "../types/metrics";

const ON_BY_DEFAULT_BODY = [
  "hydration",
  "sleep-time",
  "sleep-efficiency",
  "mood",
  "fatigue",
  "availability",
];

export const SPORT_DEFAULTS: SportDefaults[] = [
  {
    sport: "baseball",
    defaultBodyMetrics: ON_BY_DEFAULT_BODY,
    defaultTrainingMetrics: ["throwing-velocity"],
    defaultOutcomeMetrics: ["wins", "losses", "hits", "at-bats", "rbis", "runs", "errors"],
    schemaVersion: 1,
  },
  {
    sport: "basketball",
    defaultBodyMetrics: ON_BY_DEFAULT_BODY,
    defaultTrainingMetrics: ["vertical-jump"],
    defaultOutcomeMetrics: ["wins", "losses", "points", "rebounds", "assists", "blocks", "steals"],
    schemaVersion: 1,
  },
  {
    sport: "football",
    defaultBodyMetrics: ON_BY_DEFAULT_BODY,
    defaultTrainingMetrics: ["deadlift", "bench-press", "squat"],
    defaultOutcomeMetrics: ["wins", "losses", "yards", "tackles", "touchdowns", "sacks"],
    schemaVersion: 1,
  },
  {
    sport: "lacrosse",
    defaultBodyMetrics: ON_BY_DEFAULT_BODY,
    defaultTrainingMetrics: ["sprint-time"],
    defaultOutcomeMetrics: ["wins", "losses", "goals", "assists", "ground-balls", "caused-turnovers"],
    schemaVersion: 1,
  },
  {
    sport: "track-and-field",
    defaultBodyMetrics: ON_BY_DEFAULT_BODY,
    defaultTrainingMetrics: ["reps"],
    defaultOutcomeMetrics: ["times-result", "distance-result", "height-result"],
    schemaVersion: 1,
  },
  {
    sport: "tennis",
    defaultBodyMetrics: ON_BY_DEFAULT_BODY,
    defaultTrainingMetrics: ["sprint-time"],
    defaultOutcomeMetrics: ["wins", "losses", "aces", "double-faults", "break-points-won"],
    schemaVersion: 1,
  },
];
