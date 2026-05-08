import type { ChartGeom } from "./chartGeom";
import css from "./MetricBarChart.module.css";

export interface AverageBadgeProps {
  averageRaw: number;
  formatValue: (raw: number) => string;
  yScale: (value: number) => number;
  geom: ChartGeom;
  // Optional separable unit appended to the value ("Avg: 78 kg",
  // "Avg: 1.48 g/kg"). The avg badge always shows the unit when
  // present, regardless of length.
  unit?: string;
}

const BADGE_H = 22;
// Per-character width estimate for 16px Barlow Condensed (narrow face).
// Sizes the badge so longer unit suffixes ("g/kg") aren't clipped while
// keeping it snug around the actual text width.
const CHAR_W = 6;
const PADDING_X = 4;

export function AverageBadge({
  averageRaw,
  formatValue,
  yScale,
  geom,
  unit,
}: AverageBadgeProps) {
  const avgY = yScale(averageRaw);
  const text = unit
    ? `Avg: ${formatValue(averageRaw)} ${unit}`
    : `Avg: ${formatValue(averageRaw)}`;
  const badgeW = Math.ceil(text.length * CHAR_W) + PADDING_X * 2;
  const badgeRight = geom.plotRight - 4;
  const badgeLeft = badgeRight - badgeW;
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
        width={badgeW}
        height={BADGE_H}
        rx={3}
      />
      <text
        className={css.badgeText}
        x={badgeLeft + badgeW / 2}
        y={badgeY + BADGE_H - 6}
        textAnchor="middle"
      >
        {text}
      </text>
    </g>
  );
}
