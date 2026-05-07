import type { ChartGeom } from "./chartGeom";
import css from "./MetricBarChart.module.css";

export interface AverageBadgeProps {
  averageRaw: number;
  formatValue: (raw: number) => string;
  yScale: (value: number) => number;
  geom: ChartGeom;
}

const BADGE_W = 48;
const BADGE_H = 16;

export function AverageBadge({
  averageRaw,
  formatValue,
  yScale,
  geom,
}: AverageBadgeProps) {
  const avgY = yScale(averageRaw);
  const badgeRight = geom.plotRight - 4;
  const badgeLeft = badgeRight - BADGE_W;
  const rawTop = avgY - BADGE_H / 2;
  const badgeY = Math.max(
    geom.plotTop,
    Math.min(geom.plotBottom - BADGE_H, rawTop),
  );

  return (
    <g className={css.avgBadge} aria-hidden="true">
      <rect
        className={css.avgBadgeRect}
        x={badgeLeft}
        y={badgeY}
        width={BADGE_W}
        height={BADGE_H}
        rx={3}
      />
      <text
        className={css.badgeText}
        x={badgeLeft + BADGE_W / 2}
        y={badgeY + BADGE_H - 4}
        textAnchor="middle"
      >
        Avg: {formatValue(averageRaw)}
      </text>
    </g>
  );
}
