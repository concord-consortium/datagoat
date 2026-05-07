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
  const ghostTop = goalRaw !== undefined ? yScale(goalRaw) : geom.plotTop;
  const h = Math.max(geom.plotBottom - ghostTop, 4);

  return (
    <rect
      className={css.todayGhost}
      x={x}
      y={ghostTop}
      width={Math.max(barW, 1)}
      height={h}
      aria-hidden="true"
    />
  );
}
