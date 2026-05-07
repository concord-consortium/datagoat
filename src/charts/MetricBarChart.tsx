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

// Plot region margins inside the outer SVG viewBox.
const M_TOP = 16;
const M_BOTTOM = 28;
const M_LEFT = 36;
const M_RIGHT = 12;

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

  return (
    <g aria-hidden="true">
      <Axes config={config} geom={geom} data={data} rangeKey={rangeKey} />
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
      <If condition={goalRaw !== undefined}>
        <GoalLineAndBadge
          goalRaw={goalRaw!}
          formatValue={config.formatValue}
          yScale={yScale}
          geom={geom}
        />
      </If>
      <If condition={averageRaw !== undefined}>
        <AverageBadge
          averageRaw={averageRaw!}
          formatValue={config.formatValue}
          yScale={yScale}
          geom={geom}
        />
      </If>
    </g>
  );
}
