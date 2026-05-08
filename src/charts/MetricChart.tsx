import { useId, useState } from "react";
import { ChartDataTable } from "./ChartDataTable";
import { MetricBarChart } from "./MetricBarChart";
import type { TimeRangeKey } from "../components/dashboard/TimeRangePicker";
import css from "./MetricChart.module.css";

// Final prop API for the chart. The `description` prop is composed by the
// caller (DashboardChartCard / MetricDetail) to include the goal + average
// context so SR users get a complete experience.
export interface MetricChartProps {
  type: "line" | "bar";
  metricId: string;
  data: Array<{ date: string; value: number | null }>;
  goalLine?: number;
  averageLine?: number;
  // Title becomes the <title> in the SVG and is the SR-name. Description
  // becomes the <desc> for SR detail.
  title: string;
  description: string;
  width?: number;
  height?: number;
  rangeKey?: TimeRangeKey;
  // Data table label override (defaults to the title).
  dataTableTitle?: string;
  // Distinguishable skeleton variant during DataContext loading.
  loading?: boolean;
}

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 180;

export function MetricChart({
  type,
  metricId,
  data,
  goalLine,
  averageLine,
  title,
  description,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  rangeKey = "7d",
  dataTableTitle,
  loading = false,
}: MetricChartProps) {
  const titleId = useId();
  const descId = useId();
  const [showData, setShowData] = useState(false);

  return (
    <div className={css.chartWrapper}>
      <svg
        className={css.chartSvg}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <title id={titleId}>{title}</title>
        <desc id={descId}>{description}</desc>
        {loading ? (
          <g aria-hidden="true">
            <rect
              className={css.skeletonRect}
              x="0"
              y="0"
              width={width}
              height={height}
            />
            <text
              className={css.placeholderLabel}
              x={width / 2}
              y={height / 2}
            >
              Loading chart data...
            </text>
          </g>
        ) : type === "bar" ? (
          <MetricBarChart
            metricId={metricId}
            data={data}
            goalRaw={goalLine}
            averageRaw={averageLine}
            rangeKey={rangeKey}
            width={width}
            height={height}
          />
        ) : (
          <g aria-hidden="true">
            <text
              className={css.placeholderLabel}
              x={width / 2}
              y={height / 2}
            >
              Line chart not yet implemented
            </text>
          </g>
        )}
      </svg>
      <button
        type="button"
        className={css.showDataToggle}
        onClick={() => setShowData((v) => !v)}
        aria-expanded={showData}
        aria-controls={`${titleId}-data`}
      >
        {showData ? "Hide data" : "Show data"}
      </button>
      <ChartDataTable
        id={`${titleId}-data`}
        title={dataTableTitle ?? title}
        data={data}
        metricId={metricId}
        visuallyHidden={!showData}
        loading={loading}
      />
    </div>
  );
}
