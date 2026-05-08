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

const TOOLTIP_DATE_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function formatTooltipDate(iso: string): string {
  // ISO-only string (YYYY-MM-DD) gets parsed as UTC by Date — append
  // T00:00:00 so the day doesn't shift in negative timezones.
  return TOOLTIP_DATE_FMT.format(new Date(`${iso}T00:00:00`));
}

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
        // Clamp yTop into the plot vertical range so values outside the
        // configured y-axis domain (e.g., a Lean Mass entry of 130 kg
        // when the chart tops out at 100) cap at the top/bottom edge
        // instead of overflowing into the y-axis label area.
        const yTop = Math.max(
          geom.plotTop,
          Math.min(yScale(d.value), geom.plotBottom),
        );
        const h = Math.max(2, geom.plotBottom - yTop);
        const className = meetsGoal(d.value)
          ? css.barAtOrAboveGoal
          : css.barBelowGoal;
        const valueLabel = config.unit
          ? `${config.formatValue(d.value)} ${config.unit}`
          : config.formatValue(d.value);
        const tooltip = `${valueLabel} on ${formatTooltipDate(d.date)}`;
        return (
          <rect
            key={d.date}
            className={className}
            x={x}
            y={Math.min(yTop, geom.plotBottom - 2)}
            width={Math.max(barW, 0.5)}
            height={h}
          >
            <title>{tooltip}</title>
          </rect>
        );
      })}
    </g>
  );
}
