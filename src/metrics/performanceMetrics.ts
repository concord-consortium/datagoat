import type { MetricDefinition } from "./types";
import TrophyIcon from "@/icons/metric-trophy.svg?react";
import GoalsIcon from "@/icons/metric-goals.svg?react";
import AssistsIcon from "@/icons/metric-assists.svg?react";
import YardsIcon from "@/icons/metric-yards.svg?react";
import TacklesIcon from "@/icons/metric-tackles.svg?react";

// Placeholder set per RESOLVED Open Question (Performance Log metric set).
// The designer-final per-athlete-type sets land in a follow-up; consumers
// must read from this registry, not hardcode the names.
// TODO: athlete-type-specific metric sets when designer commits.
//
// Wins + Losses share the trophy glyph (the prototype keys both off the
// 'Wins/Losses' metricIcons entry); the other four perf metrics each have
// their own glyph.
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
    Icon: TrophyIcon,
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
    Icon: TrophyIcon,
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
    Icon: GoalsIcon,
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
    Icon: AssistsIcon,
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
    Icon: YardsIcon,
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
    Icon: TacklesIcon,
  },
];
