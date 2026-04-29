import { useId, useState } from "react";
import { ChartDataTable } from "./ChartDataTable";
import css from "./MetricChart.module.css";

// Final prop API for the chart - this contract is the seam the follow-up
// "real chart rendering" story will swap behind. The placeholder doesn't
// render goalLine/averageLine visually, but they're forwarded so the
// follow-up swap is purely path-generation math. The `description` prop
// is composed by the caller (DashboardChartCard / MetricDetail) to
// include the goal + average context that the placeholder doesn't render
// visually but the <desc> exposes to SR users - giving SR users a
// complete experience even before the visual chart lands.
export interface MetricChartProps {
  type: "line" | "bar";
  data: Array<{ date: string; value: number }>;
  goalLine?: number;
  averageLine?: number;
  // Title becomes the <title> in the SVG and is the SR-name. Description
  // becomes the <desc> for SR detail.
  title: string;
  description: string;
  width?: number;
  height?: number;
  // Data table label override (defaults to the title).
  dataTableTitle?: string;
  // Distinguishable skeleton variant during DataContext loading. Per
  // spec "Empty data handling": never flash zero-value axes during load.
  loading?: boolean;
}

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 180;

export function MetricChart({
  type,
  data,
  goalLine,
  averageLine,
  title,
  description,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  dataTableTitle,
  loading = false,
}: MetricChartProps) {
  // type, data, goalLine, averageLine are all part of the final prop
  // surface but the placeholder doesn't draw them - referenced here so
  // strict TS doesn't flag them as unused.
  void type;
  void goalLine;
  void averageLine;

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
        <rect
          className={loading ? css.skeletonRect : css.placeholderRect}
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
          {loading ? "Loading chart data..." : "Chart placeholder - TBD"}
        </text>
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
        visuallyHidden={!showData}
      />
    </div>
  );
}
