import type { MetricDefinition } from "./types";
import TrophyIcon from "@/icons/metric-trophy.svg?react";
import GoalsIcon from "@/icons/metric-goals.svg?react";
import AssistsIcon from "@/icons/metric-assists.svg?react";
import YardsIcon from "@/icons/metric-yards.svg?react";
import TacklesIcon from "@/icons/metric-tackles.svg?react";

// Placeholder set per RESOLVED Open Question (Competition Log metric set).
// The designer-final per-athlete-type sets land in a follow-up; consumers
// must read from this registry, not hardcode the names.
// TODO: athlete-type-specific metric sets when designer commits.
//
// Wins and Losses ship as separate metrics here even though the prototype
// keyed them off a single 'Wins/Losses' entry - pinned by the resolved
// "Competition Log metric set" Open Question (requirements.md "Deferred
// Work"). They share TrophyIcon because the prototype defined only the
// combined glyph; the per-athlete-type real sets are the deferred follow-up.
export const COMPETITION_METRICS: MetricDefinition[] = [
  {
    id: "wins",
    name: "Wins",
    unit: "",
    type: "competition",
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
    type: "competition",
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
    type: "competition",
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
    type: "competition",
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
    type: "competition",
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
    type: "competition",
    whoCollects: "Self",
    howCollected: "Log per game",
    description: "Tackles made.",
    inputType: "numeric",
    Icon: TacklesIcon,
  },
];
