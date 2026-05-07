import { useNavigate } from "react-router-dom";
import { useUser } from "../../contexts/UserContext";
import { WELLNESS_METRICS } from "../../metrics/wellnessMetrics";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import { TrackedMetricsTable } from "./TrackedMetricsTable";
import buttons from "../form/buttons.module.css";
import css from "./TrackedMetricsTable.module.css";
import screenCss from "./TrackedDataSetup.module.css";

export function TrackedDataSetup() {
  const navigate = useNavigate();
  const { loadState, updateProfile, setTrackedMetrics } = useUser();

  const profile =
    loadState.status === "loaded" ? loadState.profile : null;

  // First-time onboarding: every metric in the registry is checked by
  // default. Returning users keep whatever's in their profile.
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
        registry={WELLNESS_METRICS}
        trackedIds={wellnessIds}
        onChangeOrder={(ids) => void handleChangeOrder("wellness", ids)}
        onToggleCheck={(id, checked) =>
          void handleToggleCheck("wellness", id, checked)
        }
        addToHref="/add-metric/wellness"
        addToLabel="Add Health & Wellness Metric"
      />

      <div className={css.chartDivider} aria-hidden="true" />

      <TrackedMetricsTable
        type="performance"
        heading="Performance Log"
        registry={PERFORMANCE_METRICS}
        trackedIds={performanceIds}
        onChangeOrder={(ids) => void handleChangeOrder("performance", ids)}
        onToggleCheck={(id, checked) =>
          void handleToggleCheck("performance", id, checked)
        }
        addToHref="/add-metric/performance"
        addToLabel="Add Performance Metric"
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
