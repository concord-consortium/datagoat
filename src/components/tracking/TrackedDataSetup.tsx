import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../contexts/UserContext";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { COMPETITION_METRICS } from "../../metrics/competitionMetrics";
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
  type: "health" | "competition",
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
  const customHealth = useMemo(
    () =>
      allCustom
        .filter((m) => m.metricType === "health")
        .map((m) => customAsMetricDefinition(m, "health")),
    [allCustom],
  );
  const customCompetition = useMemo(
    () =>
      allCustom
        .filter((m) => m.metricType === "competition")
        .map((m) => customAsMetricDefinition(m, "competition")),
    [allCustom],
  );

  // Combined registries (built-ins + customs) handed to TrackedMetricsTable.
  // Custom ids are tracked in a Set so each row's right-edge affordance
  // switches from info link → edit pencil for customs.
  const healthRegistry = useMemo(
    () => [...HEALTH_METRICS, ...customHealth],
    [customHealth],
  );
  const competitionRegistry = useMemo(
    () => [...COMPETITION_METRICS, ...customCompetition],
    [customCompetition],
  );
  const customHealthIds = useMemo(
    () => new Set(customHealth.map((m) => m.id)),
    [customHealth],
  );
  const customCompetitionIds = useMemo(
    () => new Set(customCompetition.map((m) => m.id)),
    [customCompetition],
  );

  // First-time onboarding: every built-in is checked by default.
  // Returning users keep whatever's in their profile. Custom metrics
  // appear unchecked until the user explicitly tracks them — matches
  // the "Choose what to track" semantics of this page.
  const healthIds =
    profile?.trackedHealthMetrics ?? HEALTH_METRICS.map((m) => m.id);
  const competitionIds =
    profile?.trackedCompetitionMetrics ??
    COMPETITION_METRICS.map((m) => m.id);

  async function handleToggleCheck(
    type: "health" | "competition",
    id: string,
    checked: boolean,
  ) {
    const ids = type === "health" ? healthIds : competitionIds;
    const next = checked
      ? [...ids, id].filter((v, i, arr) => arr.indexOf(v) === i)
      : ids.filter((existing) => existing !== id);
    await persistOrCache(type, next);
  }

  async function handleChangeOrder(
    type: "health" | "competition",
    next: string[],
  ) {
    await persistOrCache(type, next);
  }

  async function persistOrCache(
    type: "health" | "competition",
    next: string[],
  ) {
    if (!profile) {
      // Onboarding: no Firestore profile yet. updateProfile creates it
      // with merge: true, stamping the tracked-metric arrays so the
      // doc lands.
      await updateProfile({
        [type === "health"
          ? "trackedHealthMetrics"
          : "trackedCompetitionMetrics"]: next,
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
            Select the training and competition data you want DataGOAT to
            collect. You can update these choices anytime.
          </p>
        </div>
      )}

      <TrackedMetricsTable
        type="health"
        heading="Health & Performance Log"
        registry={healthRegistry}
        customIds={customHealthIds}
        trackedIds={healthIds}
        onChangeOrder={(ids) => void handleChangeOrder("health", ids)}
        onToggleCheck={(id, checked) =>
          void handleToggleCheck("health", id, checked)
        }
        addToHref="/add-metric/health/new"
        addToLabel="Add Health & Performance Metric"
      />

      <div className={css.chartDivider} aria-hidden="true" />

      <TrackedMetricsTable
        type="competition"
        heading="Competition Log"
        registry={competitionRegistry}
        customIds={customCompetitionIds}
        trackedIds={competitionIds}
        onChangeOrder={(ids) => void handleChangeOrder("competition", ids)}
        onToggleCheck={(id, checked) =>
          void handleToggleCheck("competition", id, checked)
        }
        addToHref="/add-metric/competition/new"
        addToLabel="Add Competition Metric"
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
