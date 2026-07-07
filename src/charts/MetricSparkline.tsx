import { getMetricChartConfig } from "./metricChartConfig";
import { linearScale } from "./linearScale";
import type { ChartGeom } from "./chartGeom";
import { Bars } from "./Bars";
import css from "./MetricSparkline.module.css";

export interface MetricSparklineProps {
  metricId: string;
  // Aligned per-day series (nulls for missing days), typically the last 7 days.
  data: Array<{ date: string; value: number | null }>;
  // Goal in raw units (profile-keyed) so the reused Bars renderer colors bars
  // meets-vs-below exactly like the dashboard/detail charts.
  goalRaw?: number;
  width?: number;
  height?: number;
}

// Tiny bar sparkline for the Health entry-page summary column. Reuses the
// dashboard's `Bars` renderer at a small size so bar coloring / goal logic
// stays consistent app-wide; adds only minimal axis lines (no labels) and drops
// the goal line, average badge, and today-ghost.
export function MetricSparkline({
  metricId,
  data,
  goalRaw,
  width = 56,
  height = 22,
}: MetricSparklineProps) {
  const config = getMetricChartConfig(metricId);

  // Leave a few px on the left/bottom for the tiny axis lines.
  const M_LEFT = 3;
  const M_RIGHT = 1;
  const M_TOP = 2;
  const M_BOTTOM = 3;
  const geom: ChartGeom = {
    plotLeft: M_LEFT,
    plotTop: M_TOP,
    plotRight: width - M_RIGHT,
    plotBottom: height - M_BOTTOM,
    plotWidth: width - M_LEFT - M_RIGHT,
    plotHeight: height - M_TOP - M_BOTTOM,
  };

  // Inverted metrics (Hydration) map [yTopRaw, yBottomRaw] -> [plotTop,
  // plotBottom] so the "best" value sits at the top (same as MetricBarChart).
  const yScale = config.inverted
    ? linearScale(
        [config.yTopRaw, config.yBottomRaw],
        [geom.plotTop, geom.plotBottom],
      )
    : linearScale(
        [config.yBottomRaw, config.yTopRaw],
        [geom.plotBottom, geom.plotTop],
      );

  return (
    <svg
      className={css.sparkline}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
    >
      <line
        className={css.axis}
        x1={geom.plotLeft}
        y1={geom.plotTop}
        x2={geom.plotLeft}
        y2={geom.plotBottom}
        vectorEffect="non-scaling-stroke"
      />
      <line
        className={css.axis}
        x1={geom.plotLeft}
        y1={geom.plotBottom}
        x2={geom.plotRight}
        y2={geom.plotBottom}
        vectorEffect="non-scaling-stroke"
      />
      <Bars
        data={data}
        goalRaw={goalRaw}
        config={config}
        yScale={yScale}
        geom={geom}
      />
    </svg>
  );
}
