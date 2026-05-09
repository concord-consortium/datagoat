import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../contexts/UserContext";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import { WELLNESS_METRICS } from "../../metrics/wellnessMetrics";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import type { MetricDefinition } from "../../metrics/types";
import type { CustomMetricDef } from "../../types/customMetrics";
import { TrackedMetricsTable } from "./TrackedMetricsTable";
import buttons from "../form/buttons.module.css";
import css from "./TrackedMetricsTable.module.css";
import screenCss from "./TrackedDataSetup.module.css";

// Adapt a CustomMetricDef into the MetricDefinition shape that
// TrackedMetricsTable / SortableMetricRow render. Optional / built-in
// fields (whoCollects, howCollected, description) stay empty — they
// aren't read on this page.
function customAsMetricDefinition(
  def: CustomMetricDef,
  type: "wellness" | "performance",
): MetricDefinition {
  return {
    id: def.id,
    name: def.name,
    unit: def.unit,
    displayUnit: def.unit,
    type,
    whoCollects: "",
    howCollected: "",
    description: "",
    inputType: def.inputType,
  };
}

export function TrackedDataSetup() {
  const navigate = useNavigate();
  const { loadState, updateProfile, setTrackedMetrics } = useUser();
  const { metrics: allCustom } = useCustomMetrics();

  const profile =
    loadState.status === "loaded" ? loadState.profile : null;

  // Custom metrics for each type, adapted to MetricDefinition shape.
  const customWellness = useMemo(
    () =>
      allCustom
        .filter((m) => m.metricType === "wellness")
        .map((m) => customAsMetricDefinition(m, "wellness")),
    [allCustom],
  );
  const customPerformance = useMemo(
    () =>
      allCustom
        .filter((m) => m.metricType === "performance")
        .map((m) => customAsMetricDefinition(m, "performance")),
    [allCustom],
  );

  // Combined registries (built-ins + customs) handed to TrackedMetricsTable.
  // Custom ids are tracked in a Set so each row's right-edge affordance
  // switches from info link → edit pencil for customs.
  const wellnessRegistry = useMemo(
    () => [...WELLNESS_METRICS, ...customWellness],
    [customWellness],
  );
  const performanceRegistry = useMemo(
    () => [...PERFORMANCE_METRICS, ...customPerformance],
    [customPerformance],
  );
  const customWellnessIds = useMemo(
    () => new Set(customWellness.map((m) => m.id)),
    [customWellness],
  );
  const customPerformanceIds = useMemo(
    () => new Set(customPerformance.map((m) => m.id)),
    [customPerformance],
  );

  // First-time onboarding: every built-in is checked by default.
  // Returning users keep whatever's in their profile. Custom metrics
  // appear unchecked until the user explicitly tracks them — matches
  // the "Choose what to track" semantics of this page.
  const wellnessIds =
    profile?.trackedWellnessMetrics ?? WELLNESS_METRICS.map((m) => m.id);
  const performanceIds =
    profile?.trackedPerformanceMetrics ??
    PERFORMANCE_METRICS.map((m) => m.id);

  async function handleToggleCheck(
    type: "wellness" | "performance",
    id: string,
    checked: boolean,
  ) {
    const ids = type === "wellness" ? wellnessIds : performanceIds;
    const next = checked
      ? [...ids, id].filter((v, i, arr) => arr.indexOf(v) === i)
      : ids.filter((existing) => existing !== id);
    await persistOrCache(type, next);
  }

  async function handleChangeOrder(
    type: "wellness" | "performance",
    next: string[],
  ) {
    await persistOrCache(type, next);
  }

  async function persistOrCache(
    type: "wellness" | "performance",
    next: string[],
  ) {
    if (!profile) {
      // Onboarding: no Firestore profile yet. updateProfile creates it
      // with merge: true, stamping the tracked-metric arrays so the
      // doc lands.
      await updateProfile({
        [type === "wellness"
          ? "trackedWellnessMetrics"
          : "trackedPerformanceMetrics"]: next,
      });
      return;
    }
    await setTrackedMetrics(type, next);
  }

  async function handleGoToDashboard() {
    await updateProfile({ trackingSetupComplete: true });
    navigate("/dashboard");
  }

  return (
    <div className={screenCss.screenContent}>
      {profile && !profile.trackingSetupComplete && (
        <div className={screenCss.profileWelcome}>
          <h2 className={screenCss.profileWelcomeTitle}>Choose what to track</h2>
          <p>
            Select the training and performance data you want DataGOAT to
            collect. You can update these choices anytime.
          </p>
        </div>
      )}

      <TrackedMetricsTable
        type="wellness"
        heading="Health & Wellness Log"
        registry={wellnessRegistry}
        customIds={customWellnessIds}
        trackedIds={wellnessIds}
        onChangeOrder={(ids) => void handleChangeOrder("wellness", ids)}
        onToggleCheck={(id, checked) =>
          void handleToggleCheck("wellness", id, checked)
        }
        addToHref="/add-metric/wellness/new"
        addToLabel="Add Custom Health & Wellness Metric"
      />

      <div className={css.chartDivider} aria-hidden="true" />

      <TrackedMetricsTable
        type="performance"
        heading="Performance Log"
        registry={performanceRegistry}
        customIds={customPerformanceIds}
        trackedIds={performanceIds}
        onChangeOrder={(ids) => void handleChangeOrder("performance", ids)}
        onToggleCheck={(id, checked) =>
          void handleToggleCheck("performance", id, checked)
        }
        addToHref="/add-metric/performance/new"
        addToLabel="Add Custom Performance Metric"
      />

      <div className={screenCss.dashboardBtnWrap}>
        <button
          type="button"
          className={buttons.setupBtn}
          onClick={handleGoToDashboard}
        >
          Go To Dashboard
          <span className={screenCss.arrow} aria-hidden="true">
            →
          </span>
        </button>
      </div>
    </div>
  );
}
