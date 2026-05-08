import { getMetricChartConfig } from "./metricChartConfig";
import { linearScale } from "./linearScale";
import type { TimeRangeKey } from "../components/dashboard/TimeRangePicker";
import type { ChartGeom } from "./chartGeom";
import { Axes } from "./Axes";
import { Bars } from "./Bars";
import { TodayGhost } from "./TodayGhost";
import { GoalLineAndBadge } from "./GoalLineAndBadge";
import { AverageBadge } from "./AverageBadge";
import { If } from "../components/common/If";

export interface MetricBarChartProps {
  metricId: string;
  data: Array<{ date: string; value: number | null }>;
  goalRaw?: number;
  averageRaw?: number;
  rangeKey: TimeRangeKey;
  width: number;
  height: number;
}

// Plot region margins inside the outer SVG viewBox. Tight on every
// side: y-axis labels sit alongside the y-axis line (baseline at
// plotTop / plotBottom) rather than above/below, so M_TOP and M_BOTTOM
// only need ascender / x-axis-label room. The long-unit case (protein)
// renders the unit line inside the plot's vertical range but in the
// left gutter — no extra top space needed.
const M_TOP = 0;
const M_BOTTOM = 28;
const M_LEFT = 56;
const M_RIGHT = 8;

export function MetricBarChart({
  metricId,
  data,
  goalRaw,
  averageRaw,
  rangeKey,
  width,
  height,
}: MetricBarChartProps) {
  const config = getMetricChartConfig(metricId);

  const geom: ChartGeom = {
    plotLeft: M_LEFT,
    plotTop: M_TOP,
    plotRight: width - M_RIGHT,
    plotBottom: height - M_BOTTOM,
    plotWidth: width - M_LEFT - M_RIGHT,
    plotHeight: height - M_TOP - M_BOTTOM,
  };

  // Inverted metrics (Hydration): yTopRaw is numerically smaller than
  // yBottomRaw, and we map [yTopRaw, yBottomRaw] → [plotTop, plotBottom]
  // so the "best" value sits at the top of the plot.
  const yScale = config.inverted
    ? linearScale(
        [config.yTopRaw, config.yBottomRaw],
        [geom.plotTop, geom.plotBottom],
      )
    : linearScale(
        [config.yBottomRaw, config.yTopRaw],
        [geom.plotBottom, geom.plotTop],
      );

  // The computed average is a raw float; round to the metric's
  // configured precision before formatValue stringifies it, so the
  // AverageBadge doesn't blow out with `8.283333333...`.
  const avgDecimals = config.avgDecimals ?? 1;
  const roundedAverage =
    averageRaw === undefined
      ? undefined
      : Number(averageRaw.toFixed(avgDecimals));

  return (
    <g aria-hidden="true">
      {/* Data layer first — bars and today-ghost are painted before
          the axes so any bar pixel that touches the x-axis line gets
          covered by the line, not the other way around. */}
      <Bars
        data={data}
        goalRaw={goalRaw}
        config={config}
        yScale={yScale}
        geom={geom}
      />
      <TodayGhost
        data={data}
        goalRaw={goalRaw}
        yScale={yScale}
        geom={geom}
      />
      <Axes config={config} geom={geom} data={data} rangeKey={rangeKey} />
      <If condition={goalRaw !== undefined}>
        <GoalLineAndBadge
          goalRaw={goalRaw!}
          formatValue={config.formatValue}
          yScale={yScale}
          geom={geom}
          unit={config.unit}
          isLongUnit={config.isLongUnit}
        />
      </If>
      <If condition={roundedAverage !== undefined}>
        <AverageBadge
          averageRaw={roundedAverage!}
          formatValue={config.formatValue}
          yScale={yScale}
          unit={config.unit}
          geom={geom}
        />
      </If>
    </g>
  );
}
