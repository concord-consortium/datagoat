import { DashboardHeaderSlide } from "./DashboardHeaderSlide";
import { ActivityCalendar } from "./ActivityCalendar";
import { DashLogHeader } from "./DashLogHeader";
import { DashboardChartCard } from "./DashboardChartCard";
import { CodapButton } from "./CodapButton";
import { SectionHeading } from "../layout/SectionHeading";
import { useUser } from "../../contexts/UserContext";
import { useData } from "../../contexts/DataContext";
import { useNavMenu } from "../../contexts/NavMenuContext";
import { WELLNESS_METRICS } from "../../metrics/wellnessMetrics";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import { HISTORY, dateAtOffset, toISO } from "../../utils/dates";
import { getChipState } from "../../utils/wellnessCompleteness";
import HomeIcon from "@/icons/home.svg?react";
import css from "./Dashboard.module.css";

// Dashboard scaffold: header carousel + welcome + activity calendars +
// log CTAs. Chart cards are added in Step 14 (placeholder gray-box +
// metric picker + TimeRangePicker + CodapButton).
export function Dashboard() {
  const { loadState } = useUser();
  const { wellness, performance } = useData();
  const { setIsOpen: setMenuOpen } = useNavMenu();

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

  // Wellness CTA copy. Three states (matches prototype _updateDashStatus
  // around HTML line 7662): all-logged success copy; partial "log N
  // remaining metric(s)"; empty "log your N metrics for today". The
  // &nbsp; on either side of the highlight prevents the bolded pill
  // from wrapping onto its own line on narrow widths (prototype HTML
  // line 4196).
  const wellnessRemaining = trackedWellnessIds.length - wellnessLogged;
  let wellnessPre: string | undefined;
  let wellnessHighlight: string | undefined;
  let wellnessPost: string | undefined;
  let wellnessStatus: string;
  if (wellnessChip === "all") {
    wellnessStatus = "Great! You've logged all your health & wellness data!";
  } else if (wellnessLogged > 0) {
    wellnessPre = "Log ";
    wellnessHighlight = `${wellnessRemaining} remaining metric${wellnessRemaining === 1 ? "" : "s"}`;
    wellnessPost = " for today.";
    wellnessStatus = `${wellnessPre}${wellnessHighlight}${wellnessPost}`;
  } else {
    wellnessPre = "Log your ";
    wellnessHighlight = `${trackedWellnessIds.length} metric${trackedWellnessIds.length === 1 ? "" : "s"}`;
    wellnessPost = " for today.";
    wellnessStatus = `${wellnessPre}${wellnessHighlight}${wellnessPost}`;
  }

  const performanceStatus = performanceLoggedAny
    ? "Great! You've logged your performance data!"
    : "No performance data logged today.";

  return (
    <div className={css.dashboardScreen}>
      <DashboardHeaderSlide />
      <SectionHeading
        title="Dashboard"
        icon={<HomeIcon />}
        showHome={false}
        onOpenMenu={() => setMenuOpen(true)}
      />
      <div className={css.screenContent}>
        <p className={css.dashboardWelcome}>
          <strong className={css.dashboardWelcomeTitle}>Your Dashboard</strong>
          This is your home base. Here you’ll see a snapshot of your recent
          activity, trends, and overall progress. Check back daily to stay on
          top of your goals.
        </p>

        {/* Health & Wellness Log Section. Performance section omits the
            ActivityCalendar entirely, matching the prototype's dashboard
            layout (only wellness has a section calendar at HTML line
            4170-4187; performance section starts with dash-log-label-row
            directly at line 4225). */}
        <div className={`${css.dashLogSection} ${css.dashWellnessSection}`}>
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
            status={wellnessStatus}
            pre={wellnessPre}
            highlight={wellnessHighlight}
            post={wellnessPost}
          />
          <DashboardChartCard
            type="wellness"
            trackedMetricIds={trackedWellnessIds}
            wellnessEntries={wellnessEntries}
            loading={wellness.status === "loading"}
          />
        </div>

        <hr className={css.sectionRule} aria-hidden="true" />

        {/* Performance Log Section. Tracked-metric ids unused for the
            section header itself but forwarded to the chart card. */}
        <div className={`${css.dashLogSection} ${css.dashPerformanceSection}`}>
          <div className={css.dashLogLabelRow}>
            <span className={css.sectionCalToday}>Performance Data</span>
          </div>
          <DashLogHeader type="performance" status={performanceStatus} />
          <DashboardChartCard
            type="performance"
            trackedMetricIds={trackedPerformanceIds}
            performanceEntries={performanceEntries}
            loading={performance.status === "loading"}
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
