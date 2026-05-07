import type { MetricChartConfig } from "./metricChartConfig";
import type { ChartGeom } from "./chartGeom";
import type { TimeRangeKey } from "../components/dashboard/TimeRangePicker";
import { xAxisLabelIndices } from "./xAxisLabels";
import css from "./MetricBarChart.module.css";

export interface AxesProps {
  config: MetricChartConfig;
  geom: ChartGeom;
  data: Array<{ date: string; value: number | null }>;
  rangeKey: TimeRangeKey;
}

export function Axes({ config, geom, data, rangeKey }: AxesProps) {
  const N = data.length;
  const cellW = N > 0 ? geom.plotWidth / N : 0;
  const labelSet = xAxisLabelIndices(rangeKey, N);

  return (
    <g aria-hidden="true">
      <text
        className={css.yLabel}
        x={geom.plotLeft - 6}
        y={geom.plotTop + 4}
        textAnchor="end"
      >
        {config.formatValue(config.yTopRaw)}
      </text>
      <text
        className={css.yLabel}
        x={geom.plotLeft - 6}
        y={geom.plotBottom}
        textAnchor="end"
      >
        {config.formatValue(config.yBottomRaw)}
      </text>

      {data.map((d, i) =>
        labelSet.has(i) ? (
          <text
            key={`xlbl-${d.date}`}
            className={css.xLabel}
            x={geom.plotLeft + i * cellW + cellW / 2}
            y={geom.plotBottom + 14}
          >
            {formatXLabel(d.date)}
          </text>
        ) : null,
      )}
    </g>
  );
}

function formatXLabel(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${Number(m[1])}/${Number(m[2])}`;
}
