import { DashboardHeaderSlide } from "./DashboardHeaderSlide";
import { ActivityCalendar } from "./ActivityCalendar";
import { DashLogHeader } from "./DashLogHeader";
import { DashboardChartCard } from "./DashboardChartCard";
import { CodapButton } from "./CodapButton";
import { useUser } from "../../contexts/UserContext";
import { useData } from "../../contexts/DataContext";
import { WELLNESS_METRICS } from "../../metrics/wellnessMetrics";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import { HISTORY, dateAtOffset, toISO } from "../../utils/dates";
import { getChipState } from "../../utils/wellnessCompleteness";
import css from "./Dashboard.module.css";

// Dashboard scaffold: header carousel + welcome + activity calendars +
// log CTAs. Chart cards are added in Step 14 (placeholder gray-box +
// metric picker + TimeRangePicker + CodapButton).
export function Dashboard() {
  const { loadState } = useUser();
  const { wellness, performance } = useData();

  const profile = loadState.status === "loaded" ? loadState.profile : null;

  const trackedWellnessIds =
    profile?.trackedWellnessMetrics ?? WELLNESS_METRICS.map((m) => m.id);
  const trackedPerformanceIds =
    profile?.trackedPerformanceMetrics ?? PERFORMANCE_METRICS.map((m) => m.id);

  const wellnessEntries =
    wellness.status === "loaded" ? wellness.entries : [];
  const performanceEntries =
    performance.status === "loaded" ? performance.entries : [];

  // Compute today's wellness completeness for the CTA copy.
  const todayIso = toISO(dateAtOffset(HISTORY));
  const todayWellness =
    wellnessEntries.find((e) => e.date === todayIso) ?? null;
  const wellnessChip = getChipState(todayWellness, trackedWellnessIds);
  const wellnessLogged = countWellnessLogged(
    todayWellness,
    trackedWellnessIds,
  );

  const todayPerformance =
    performanceEntries.find((e) => e.date === todayIso) ?? null;
  const performanceLoggedAny = !!(
    todayPerformance &&
    Object.values(todayPerformance.metrics ?? {}).some((v) => {
      if (typeof v === "number") return v > 0;
      if (typeof v === "string") return v.trim() !== "";
      return false;
    })
  );

  const wellnessRemaining = trackedWellnessIds.length - wellnessLogged;
  const wellnessStatusPre = "Log your ";
  const wellnessStatusHighlight =
    wellnessChip === "all"
      ? "all metrics"
      : `${wellnessRemaining > 0 ? wellnessRemaining : trackedWellnessIds.length} metrics`;
  const wellnessStatusPost = " for today.";

  return (
    <div className={css.dashboardScreen}>
      <DashboardHeaderSlide />
      <div className={css.screenContent}>
        <p className={css.dashboardWelcome}>
          <strong className={css.dashboardWelcomeTitle}>Your Dashboard</strong>
          This is your home base. Here you’ll see a snapshot of your recent
          activity, trends, and overall progress. Check back daily to stay on
          top of your goals.
        </p>

        {/* Health & Wellness Log Section */}
        <div className={css.dashLogSection}>
          <ActivityCalendar
            type="wellness"
            trackedMetricIds={trackedWellnessIds}
            wellnessEntries={wellnessEntries}
          />
          <hr className={css.sectionRule} aria-hidden="true" />
          <div className={css.dashLogLabelRow}>
            <span className={css.sectionCalToday}>
              Health & Wellness Data
            </span>
          </div>
          <DashLogHeader
            type="wellness"
            status="Log your metrics for today."
            pre={wellnessStatusPre}
            highlight={wellnessStatusHighlight}
            post={wellnessStatusPost}
          />
          <DashboardChartCard
            type="wellness"
            trackedMetricIds={trackedWellnessIds}
            wellnessEntries={wellnessEntries}
          />
        </div>

        <hr className={css.sectionRule} aria-hidden="true" />

        {/* Performance Log Section */}
        <div className={css.dashLogSection}>
          <ActivityCalendar
            type="performance"
            trackedMetricIds={trackedPerformanceIds}
            performanceEntries={performanceEntries}
          />
          <hr className={css.sectionRule} aria-hidden="true" />
          <div className={css.dashLogLabelRow}>
            <span className={css.sectionCalToday}>Performance Data</span>
          </div>
          <DashLogHeader
            type="performance"
            status={
              performanceLoggedAny
                ? "Performance data logged today."
                : "No perf. data logged today."
            }
          />
          <DashboardChartCard
            type="performance"
            trackedMetricIds={trackedPerformanceIds}
            performanceEntries={performanceEntries}
          />
        </div>

        <hr className={css.sectionRule} aria-hidden="true" />

        <CodapButton />
      </div>
    </div>
  );
}

function countWellnessLogged(
  entry: Parameters<typeof getChipState>[0],
  trackedIds: string[],
): number {
  let n = 0;
  for (const id of trackedIds) {
    if (getChipState(entry, [id]) !== "none") n++;
  }
  return n;
}
