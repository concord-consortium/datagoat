import type { ChartGeom } from "./chartGeom";
import css from "./MetricBarChart.module.css";

export interface GoalLineAndBadgeProps {
  goalRaw: number;
  formatValue: (raw: number) => string;
  yScale: (value: number) => number;
  geom: ChartGeom;
  // Optional separable unit (e.g. "kg"). Inlined next to the value
  // ("Goal 65 kg") when present and short. Long units (isLongUnit
  // true; e.g. "g/kg") are dropped from the goal badge — they show
  // on the y-axis instead.
  unit?: string;
  isLongUnit?: boolean;
}

const BADGE_H = 36;
// Gap between the badge's right edge and the y-axis line so the badge
// has visible breathing room from the chart.
const RIGHT_GAP = 8;
// Per-character width estimate for 16px Barlow Condensed; matches the
// avg badge so both badges feel proportional.
const CHAR_W = 7;
const PADDING_X = 8;

export function GoalLineAndBadge({
  goalRaw,
  formatValue,
  yScale,
  geom,
  unit,
  isLongUnit,
}: GoalLineAndBadgeProps) {
  const y = yScale(goalRaw);
  const valueText =
    unit && !isLongUnit ? `${formatValue(goalRaw)} ${unit}` : formatValue(goalRaw);
  const longestChars = Math.max("Goal".length, valueText.length);
  const badgeW = Math.ceil(longestChars * CHAR_W) + PADDING_X * 2;
  const halfW = badgeW / 2;
  // Clamp the badge's right-edge anchor so the rect (drawn from x = -badgeW
  // relative to translate) never bleeds past the SVG's left edge. Wide
  // value text (e.g. "65 kg") that would otherwise clip gets shifted
  // right just enough to keep the full badge inside the viewBox.
  const anchorX = Math.max(badgeW, geom.plotLeft - RIGHT_GAP);
  return (
    <g aria-hidden="true">
      <line
        className={css.goalLine}
        x1={geom.plotLeft}
        x2={geom.plotRight}
        y1={y}
        y2={y}
      />
      <g
        className={css.goalBadge}
        transform={`translate(${anchorX}, ${y})`}
      >
        <rect
          className={css.goalBadgeRect}
          x={-badgeW}
          y={-BADGE_H / 2}
          width={badgeW}
          height={BADGE_H}
          rx={4}
        />
        <text
          className={css.goalBadgeText}
          x={-halfW}
          y={-3}
          textAnchor="middle"
        >
          Goal
        </text>
        <text
          className={css.goalBadgeText}
          x={-halfW}
          y={13}
          textAnchor="middle"
        >
          {valueText}
        </text>
      </g>
    </g>
  );
}
