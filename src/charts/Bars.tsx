import type { MetricChartConfig } from "./metricChartConfig";
import type { ChartGeom } from "./chartGeom";
import css from "./MetricBarChart.module.css";

export interface BarsProps {
  data: Array<{ date: string; value: number | null }>;
  goalRaw?: number;
  config: MetricChartConfig;
  yScale: (value: number) => number;
  geom: ChartGeom;
}

const BAR_WIDTH_RATIO = 0.8;

export function Bars({ data, goalRaw, config, yScale, geom }: BarsProps) {
  const N = data.length;
  const cellW = N > 0 ? geom.plotWidth / N : 0;
  const barW = cellW * BAR_WIDTH_RATIO;

  const meetsGoal = (v: number): boolean => {
    if (goalRaw === undefined) return true;
    return config.inverted ? v <= goalRaw : v >= goalRaw;
  };

  return (
    <g aria-hidden="true">
      {data.map((d, i) => {
        if (d.value === null) return null;
        const x = geom.plotLeft + i * cellW + (cellW - barW) / 2;
        const yTop = yScale(d.value);
        const h = Math.max(2, geom.plotBottom - yTop);
        const className = meetsGoal(d.value)
          ? css.barAtOrAboveGoal
          : css.barBelowGoal;
        return (
          <rect
            key={d.date}
            className={className}
            x={x}
            y={Math.min(yTop, geom.plotBottom - 2)}
            width={Math.max(barW, 0.5)}
            height={h}
          />
        );
      })}
    </g>
  );
}
