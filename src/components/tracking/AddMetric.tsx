import { Link, Navigate, useParams } from "react-router-dom";
import { useUser } from "../../contexts/UserContext";
import { ADDABLE_WELLNESS, ADDABLE_PERFORMANCE } from "../../metrics/addableMetrics";
import { WELLNESS_METRICS } from "../../metrics/wellnessMetrics";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import type { MetricDefinition } from "../../metrics/types";
import PlusIcon from "@/icons/plus.svg?react";
import MinusIcon from "@/icons/minus.svg?react";
import CustomMetricIcon from "@/icons/custom-metric.svg?react";
import css from "./AddMetric.module.css";

// Browse + add new metrics. Reads :type ('wellness' | 'performance')
// from the URL, lists ADDABLE_* in full, and toggles each row's tracked
// state via setTrackedMetrics(). Already-tracked rows show a red minus
// button that un-tracks the metric; not-yet-tracked rows show a plus
// button that tracks it. Per the prototype, rows never disappear from
// this list — the toggle just flips state.
export function AddMetric() {
  const { type } = useParams<{ type: string }>();
  if (type !== "wellness" && type !== "performance") {
    return <Navigate to="/setup/tracking" replace />;
  }
  return <AddMetricInner type={type} />;
}

function AddMetricInner({ type }: { type: "wellness" | "performance" }) {
  const { loadState, updateProfile, setTrackedMetrics } = useUser();
  const profile = loadState.status === "loaded" ? loadState.profile : null;

  const addable = type === "wellness" ? ADDABLE_WELLNESS : ADDABLE_PERFORMANCE;
  const builtIn = type === "wellness" ? WELLNESS_METRICS : PERFORMANCE_METRICS;

  const trackedKey =
    type === "wellness" ? "trackedWellnessMetrics" : "trackedPerformanceMetrics";

  const trackedIds = profile?.[trackedKey] ?? builtIn.map((m) => m.id);

  async function persist(next: string[]) {
    if (!profile) {
      await updateProfile({ [trackedKey]: next });
      return;
    }
    await setTrackedMetrics(type, next);
  }

  async function handleAdd(metric: MetricDefinition) {
    const next = [...trackedIds, metric.id].filter(
      (v, i, arr) => arr.indexOf(v) === i,
    );
    await persist(next);
  }

  async function handleRemove(metric: MetricDefinition) {
    const next = trackedIds.filter((id) => id !== metric.id);
    await persist(next);
  }

  return (
    <div className={css.addMetricScreen}>
      <div className={css.colHeaders}>
        <span className={css.colHMetric}>Metric</span>
        <span className={css.colHInfo}>Info</span>
        <span className={css.colHAction} />
      </div>
      <ul className={css.addMetricList}>
        {addable.map((m) => {
          const isTracked = trackedIds.includes(m.id);
          const detailHref = `/${type}/${m.id}`;
          return (
            <li key={m.id}>
              <span className={css.metricNameCol}>{m.name}</span>
              <Link
                to={detailHref}
                className={css.metricInfoBtn}
                aria-label="More information"
              >
                <CustomMetricIcon />
              </Link>
              {isTracked ? (
                <button
                  type="button"
                  className={css.removeBtn}
                  aria-label={`Remove ${m.name}`}
                  onClick={() => void handleRemove(m)}
                >
                  <MinusIcon />
                </button>
              ) : (
                <button
                  type="button"
                  className={css.addBtn}
                  aria-label={`Add ${m.name}`}
                  onClick={() => void handleAdd(m)}
                >
                  <PlusIcon />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
