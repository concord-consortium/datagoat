import type { MetricDefinition } from "./types";
import TrophyIcon from "@/icons/metric-trophy.svg?react";
import GoalsIcon from "@/icons/metric-goals.svg?react";

// Default-on Competition metrics. Per the DGT-51 design source
// ("Comp" rows of the Metrics tab), Scores / Times / Points-Goals
// are default-on; Winning Percentage is a Win/Loss tile selector
// that we defer to a follow-up (would replace wins/losses).
// Assists / Tackles / Yards moved to ADDABLE_COMPETITION (default-off).
// Rebounds / Blocks / Digs are new and also default-off.
//
// Wins and Losses ship as separate metrics (a follow-up ticket
// migrates them into a single Winning Percentage Win/Loss tile).
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
    id: "scores",
    name: "Scores",
    unit: "",
    type: "competition",
    whoCollects: "Self",
    howCollected: "Log per competition (e.g., gymnastics).",
    description: "Numeric score recorded for the competition.",
    inputType: "numeric",
  },
  {
    id: "times",
    name: "Times",
    unit: "min",
    type: "competition",
    whoCollects: "Self",
    howCollected: "Log per competition (track / cross-country / swim).",
    description: "Competition time. Unit selection (h / m / s) is a follow-up.",
    inputType: "numeric",
  },
  {
    id: "goals",
    name: "Points/Goals",
    unit: "",
    type: "competition",
    whoCollects: "Self",
    howCollected: "Log per game",
    description: "Points or goals scored.",
    inputType: "numeric",
    Icon: GoalsIcon,
  },
];
