import type { MetricDefinition } from "./types";

// Placeholder set per RESOLVED Open Question (Performance Log metric set).
// The designer-final per-athlete-type sets land in a follow-up; consumers
// must read from this registry, not hardcode the names.
// TODO: athlete-type-specific metric sets when designer commits.
export const PERFORMANCE_METRICS: MetricDefinition[] = [
  {
    id: "wins",
    name: "Wins",
    unit: "",
    type: "performance",
    whoCollects: "Self",
    howCollected: "Log per game",
    description: "Number of wins in the period.",
    inputType: "numeric",
  },
  {
    id: "losses",
    name: "Losses",
    unit: "",
    type: "performance",
    whoCollects: "Self",
    howCollected: "Log per game",
    description: "Number of losses in the period.",
    inputType: "numeric",
  },
  {
    id: "goals",
    name: "Goals",
    unit: "",
    type: "performance",
    whoCollects: "Self",
    howCollected: "Log per game",
    description: "Goals scored.",
    inputType: "numeric",
  },
  {
    id: "assists",
    name: "Assists",
    unit: "",
    type: "performance",
    whoCollects: "Self",
    howCollected: "Log per game",
    description: "Assists recorded.",
    inputType: "numeric",
  },
  {
    id: "yards",
    name: "Yards",
    unit: "yd",
    type: "performance",
    whoCollects: "Self",
    howCollected: "Log per game",
    description: "Total yards.",
    inputType: "numeric",
  },
  {
    id: "tackles",
    name: "Tackles",
    unit: "",
    type: "performance",
    whoCollects: "Self",
    howCollected: "Log per game",
    description: "Tackles made.",
    inputType: "numeric",
  },
];
