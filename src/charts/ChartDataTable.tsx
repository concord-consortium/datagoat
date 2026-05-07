import common from "../components/common.module.css";
import css from "./ChartDataTable.module.css";

export interface ChartDataTableProps {
  id?: string;
  title: string;
  data: Array<{ date: string; value: number | null }>;
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
  visuallyHidden = true,
  loading = false,
}: ChartDataTableProps) {
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
              <td>{row.value === null ? "—" : row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
