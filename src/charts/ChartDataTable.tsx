import common from "../components/common.module.css";
import { formatMetricValue } from "./chartSeries";
import css from "./ChartDataTable.module.css";

export interface ChartDataTableProps {
  id?: string;
  title: string;
  data: Array<{ date: string; value: number | null }>;
  // Metric id used to format each value cell with the same per-metric
  // unit and decimal rules as the chart badges/axes — so SR users
  // hear "75%" / "65 kg" / "1.4 g/kg" rather than the raw number.
  // Optional for unconfigured / unknown metrics; falls back to the
  // raw number string.
  metricId?: string;
  // When true, the table is rendered with the visually-hidden utility so
  // SR users can read it but sighted users don't see it. The "Show data"
  // toggle in MetricChart flips this.
  visuallyHidden?: boolean;
  // When true and data is empty, the empty-state message reflects that
  // the chart is still loading rather than claiming there is no data.
  loading?: boolean;
}

// Visually-hidden adjacent <table> of date/value pairs. The table is the
// FULLY WORKING version of the chart's data; the chart-placeholder above
// is gray-box, but this table is real. Per the spec's a11y contract: SR
// users get a complete experience even before the visual chart lands.
//
// Use className={common.visuallyHidden} (NOT display:none / hidden) so
// the table stays in the accessibility tree even when not rendered to
// sighted users.
export function ChartDataTable({
  id,
  title,
  data,
  metricId,
  visuallyHidden = true,
  loading = false,
}: ChartDataTableProps) {
  const formatCell = (v: number) =>
    metricId ? formatMetricValue(metricId, v) : `${v}`;
  if (data.length === 0) {
    return (
      <div
        id={id}
        className={visuallyHidden ? common.visuallyHidden : undefined}
      >
        <p className={css.empty}>
          {loading
            ? `${title} data is loading...`
            : "No data yet - log a few days to see your trends."}
        </p>
      </div>
    );
  }

  return (
    <div
      id={id}
      className={visuallyHidden ? common.visuallyHidden : undefined}
    >
      <table className={css.dataTable}>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.date}>
              <td>{row.date}</td>
              <td>{row.value === null ? "—" : formatCell(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
