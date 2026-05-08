import type { ChartGeom } from "./chartGeom";
import css from "./MetricBarChart.module.css";

export interface TodayGhostProps {
  data: Array<{ date: string; value: number | null }>;
  goalRaw?: number;
  yScale: (value: number) => number;
  geom: ChartGeom;
}

const BAR_WIDTH_RATIO = 0.8;

export function TodayGhost({ data, goalRaw, yScale, geom }: TodayGhostProps) {
  const N = data.length;
  if (N === 0) return null;
  const today = data[N - 1];
  if (today.value !== null) return null;

  const cellW = geom.plotWidth / N;
  const barW = cellW * BAR_WIDTH_RATIO;
  const x = geom.plotLeft + (N - 1) * cellW + (cellW - barW) / 2;
  const w = Math.max(barW, 1);
  // Clamp ghostTop into [plotTop, plotBottom - 4] so the bottom edge
  // stays at plotBottom and there's always at least 4px of visible
  // height (matters for goals near yMin).
  const rawGhostTop =
    goalRaw !== undefined ? yScale(goalRaw) : geom.plotTop;
  const ghostTop = Math.max(
    geom.plotTop,
    Math.min(rawGhostTop, geom.plotBottom - 4),
  );
  const ghostBottom = geom.plotBottom;

  // Polyline: bottom-left → top-left → top-right → bottom-right.
  // Three sides only — the bottom edge is intentionally absent so the
  // x-axis line carries that visual weight instead of a heavier dashed
  // stroke right on top of it.
  const points = `${x},${ghostBottom} ${x},${ghostTop} ${x + w},${ghostTop} ${x + w},${ghostBottom}`;

  return (
    <polyline
      className={css.todayGhost}
      points={points}
      fill="none"
      aria-hidden="true"
    />
  );
}
