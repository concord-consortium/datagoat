import { Navigate, useParams } from "react-router-dom";
import { useUser } from "../../contexts/UserContext";
import { ADDABLE_WELLNESS, ADDABLE_PERFORMANCE } from "../../metrics/addableMetrics";
import { WELLNESS_METRICS } from "../../metrics/wellnessMetrics";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import type { MetricDefinition } from "../../metrics/types";
import PlusIcon from "@/icons/plus-circle.svg?react";
import InfoCircleIcon from "@/icons/info-circle.svg?react";
import css from "./AddMetric.module.css";

// Browse + add new metrics. Reads :type ('wellness' | 'performance')
// from the URL, lists ADDABLE_* (filtered to exclude already-tracked
// IDs from the user's profile), and adds a chosen metric via the same
// setTrackedMetrics() helper TrackedDataSetup uses.
//
// Per spec: addable metrics already in the tracked list are filtered
// OUT entirely (not shown with a remove button - that's the
// TrackedDataSetup edit-mode UI). When all addables are tracked, an
// empty-state message shows.
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

  // Tracked IDs default to the full built-in registry for new users (the
  // same default TrackedDataSetup uses when profile is absent), so the
  // "already-tracked" filter Just Works on the onboarding path.
  const trackedIds =
    profile?.[
      type === "wellness"
        ? "trackedWellnessMetrics"
        : "trackedPerformanceMetrics"
    ] ?? builtIn.map((m) => m.id);

  const visible = addable.filter((m) => !trackedIds.includes(m.id));

  async function handleAdd(metric: MetricDefinition) {
    const next = [...trackedIds, metric.id].filter(
      (v, i, arr) => arr.indexOf(v) === i,
    );
    if (!profile) {
      await updateProfile({
        [type === "wellness"
          ? "trackedWellnessMetrics"
          : "trackedPerformanceMetrics"]: next,
      });
      return;
    }
    await setTrackedMetrics(type, next);
  }

  return (
    <div className={css.addMetricScreen}>
      <div className={css.colHeaders}>
        <span className={css.colHMetric}>Metric</span>
        <span className={css.colHInfo}>Info</span>
        <span className={css.colHAction} />
      </div>
      {visible.length === 0 ? (
        <p className={css.emptyState}>
          {type === "wellness"
            ? "All Health & Wellness metrics already tracked - check back as we add more."
            : "All Performance metrics already tracked - check back as we add more."}
        </p>
      ) : (
        <ul className={css.addMetricList}>
          {visible.map((m) => {
            const Icon = m.Icon ?? InfoCircleIcon;
            return (
              <li key={m.id}>
                <span className={css.metricNameCol}>{m.name}</span>
                <button
                  type="button"
                  className={css.metricInfoBtn}
                  aria-label={`${m.name} info`}
                >
                  <Icon />
                </button>
                <button
                  type="button"
                  className={css.addBtn}
                  aria-label={`Add ${m.name}`}
                  onClick={() => void handleAdd(m)}
                >
                  <PlusIcon />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
