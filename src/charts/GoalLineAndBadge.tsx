import type { ChartGeom } from "./chartGeom";
import css from "./MetricBarChart.module.css";

export interface GoalLineAndBadgeProps {
  goalRaw: number;
  formatValue: (raw: number) => string;
  yScale: (value: number) => number;
  geom: ChartGeom;
}

export function GoalLineAndBadge({
  goalRaw,
  formatValue,
  yScale,
  geom,
}: GoalLineAndBadgeProps) {
  const y = yScale(goalRaw);
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
        transform={`translate(${geom.plotLeft - 4}, ${y})`}
      >
        <rect
          className={css.goalBadgeRect}
          x={-32}
          y={-12}
          width={32}
          height={24}
          rx={3}
        />
        <text className={css.goalBadgeText} x={-16} y={-1} textAnchor="middle">
          Goal
        </text>
        <text className={css.goalBadgeText} x={-16} y={10} textAnchor="middle">
          {formatValue(goalRaw)}
        </text>
      </g>
    </g>
  );
}
