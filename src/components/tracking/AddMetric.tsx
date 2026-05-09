import { Link, Navigate, useParams } from "react-router-dom";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import CustomMetricIcon from "@/icons/custom-metric.svg?react";
import css from "./AddMetric.module.css";

// AddMetric (rewritten for DGT-36 demo slice). Lists the user's
// custom metrics for the current type ("wellness" | "performance"),
// with a "+ Create custom metric" CTA at the top. Each row links to
// the edit form. Built-in metric browsing and the per-row tracking
// toggle are intentionally removed for the demo slice — built-in
// tracking is managed from /setup/tracking; custom-metric tracking
// integration is deferred to the next plan.
export function AddMetric() {
  const { type } = useParams<{ type: string }>();
  if (type !== "wellness" && type !== "performance") {
    return <Navigate to="/setup/tracking" replace />;
  }
  return <AddMetricInner type={type} />;
}

function AddMetricInner({ type }: { type: "wellness" | "performance" }) {
  const { metrics: allCustom, loading } = useCustomMetrics();
  const customForType = allCustom.filter((m) => m.metricType === type);

  return (
    <div className={css.addMetricScreen}>
      <Link to={`/add-metric/${type}/new`} className={css.createCta}>
        + Create custom metric
      </Link>

      <h2 className={css.sectionHead}>Your custom {type} metrics</h2>

      {loading ? (
        <p className={css.emptyHint}>Loading…</p>
      ) : customForType.length === 0 ? (
        <p className={css.emptyHint}>None yet. Create one above to get started.</p>
      ) : (
        <ul className={css.addMetricList}>
          {customForType.map((m) => (
            <li key={m.id}>
              <span className={css.metricNameCol}>
                <CustomMetricIcon
                  style={{
                    width: 20,
                    height: 20,
                    verticalAlign: "middle",
                    marginRight: 8,
                  }}
                  aria-hidden="true"
                />
                {m.name}
                {m.unit && (
                  <span style={{ color: "var(--subtext)", marginLeft: 6 }}>
                    ({m.unit})
                  </span>
                )}
              </span>
              <Link
                to={`/add-metric/${type}/${m.id}`}
                className={css.editBtn}
                aria-label={`Edit ${m.name}`}
              >
                ✏︎
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
