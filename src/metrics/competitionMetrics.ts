import type { MetricDefinition } from "./types";
import TrophyIcon from "@/icons/metric-trophy.svg?react";
import GoalsIcon from "@/icons/metric-goals.svg?react";

// Win / Loss levels for winningPercentage. Value 1 = win, 0 = loss
// so summing across entries yields the win count; the percentage is
// wins / (wins + losses).
const WIN_LOSS_LEVELS = [
  { label: "Loss", value: 0 },
  { label: "Win", value: 1 },
];

// Default-on Competition metrics. Per the DGT-51 design source
// ("Comp" rows of the Metrics tab), Winning Percentage / Scores /
// Times / Points-Goals are default-on. Winning Percentage replaces
// the prior wins/losses pair: users now log a single Win/Loss tile
// per competition; the percentage is derived in the Total column.
// Assists / Tackles / Yards moved to ADDABLE_COMPETITION (default-off).
// Rebounds / Blocks / Digs are new and also default-off.
export const COMPETITION_METRICS: MetricDefinition[] = [
  {
    id: "winningPercentage",
    name: "Winning Percentage",
    // Per-competition input is Win or Loss; the percentage is
    // derived in the Total cell. unit / min / max are intentionally
    // omitted to keep MetricDetail's Estimated Range honest about
    // the stored shape.
    unit: "",
    type: "competition",
    whoCollects: "Self",
    howCollected: "Tap Win or Loss after each competition.",
    description:
      "Percentage of competitions won. Logged per competition as Win or Loss; the percentage is derived across the time window.",
    inputType: "ordinal",
    levels: WIN_LOSS_LEVELS,
    Icon: TrophyIcon,
    estimatedRange: "Win or Loss per competition",
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
