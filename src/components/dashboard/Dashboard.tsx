import { ActivityCalendar } from "./ActivityCalendar";
import { DashLogHeader } from "./DashLogHeader";
import { DashboardChartCard } from "./DashboardChartCard";
import { CodapButton } from "./CodapButton";
import { useUser } from "../../contexts/UserContext";
import { useData } from "../../contexts/DataContext";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import { useMetricOverrides } from "../../contexts/MetricOverridesContext";
import { resolveSchedule } from "../../types/metricSchedule";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { ADDABLE_HEALTH } from "../../metrics/addableMetrics";
import { COMPETITION_METRICS } from "../../metrics/competitionMetrics";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import {
  metricsDueOn,
  remainingToLog,
  type ScheduledMetric,
} from "../../metrics/dueToday";
import type { MetricDefinition } from "../../metrics/types";
import { HISTORY, dateAtOffset, toISO } from "../../utils/dates";
import { getChipState } from "../../utils/healthCompleteness";
import css from "./Dashboard.module.css";

// Health metric definitions the tracked-id list can resolve against (built-in
// plus addable). Used to recover each tracked metric's schedule for the
// schedule-aware "due today" count.
const HEALTH_DEFS: MetricDefinition[] = [...HEALTH_METRICS, ...ADDABLE_HEALTH];

// Dashboard scaffold: header carousel + welcome + activity calendars +
// log CTAs. Chart cards are added in Step 14 (placeholder gray-box +
// metric picker + TimeRangePicker + CodapButton).
export function Dashboard() {
  const { loadState } = useUser();
  const { health, performance, competition } = useData();
  const { metrics: allCustom } = useCustomMetrics();
  const { getOverride } = useMetricOverrides();

  const profile = loadState.status === "loaded" ? loadState.profile : null;

  const trackedHealthIds =
    profile?.trackedHealthMetrics ?? HEALTH_METRICS.map((m) => m.id);
  const trackedPerformanceIds =
    profile?.trackedPerformanceMetrics ??
    PERFORMANCE_METRICS.map((m) => m.id);
  const trackedCompetitionIds =
    profile?.trackedCompetitionMetrics ?? COMPETITION_METRICS.map((m) => m.id);

  const healthEntries =
    health.status === "loaded" ? health.entries : [];
  const performanceEntries =
    performance.status === "loaded" ? performance.entries : [];
  const competitionEntries =
    competition.status === "loaded" ? competition.entries : [];

  // Schedule-aware health CTA: the "Log N remaining" count reflects only the
  // metrics whose schedule makes them due today, and drops those already logged
  // enough to keep pace this week (see metrics/dueToday). Because an entry on
  // any day of the week counts toward pace, wasHealthLogged is asked per day
  // across the current week, not just today.
  const today = dateAtOffset(HISTORY);
  const todayIso = toISO(today);
  const healthByDate = new Map(healthEntries.map((e) => [e.date, e]));
  const wasHealthLogged = (id: string, day: Date) =>
    getChipState(healthByDate.get(toISO(day)) ?? null, [id]) !== "none";
  // Resolve each tracked id to its effective schedule, spanning built-in,
  // addable, and custom health metrics, with a user override winning. Custom
  // metric values already flow through getChipState above, so this is the only
  // place custom metrics needed wiring into the due-today count.
  const trackedHealthMetrics: ScheduledMetric[] = trackedHealthIds.map((id) => {
    const base =
      HEALTH_DEFS.find((m) => m.id === id) ??
      allCustom.find((m) => m.id === id && m.metricType === "health");
    return {
      id,
      schedule: resolveSchedule(base?.schedule, getOverride(id)?.schedule),
    };
  });
  const healthDueCount = metricsDueOn(trackedHealthMetrics, today).length;
  const healthRemainingCount = remainingToLog(
    trackedHealthMetrics,
    today,
    wasHealthLogged,
  ).length;
  const healthLoggedOfDue = healthDueCount - healthRemainingCount;

  const todayCompetition =
    competitionEntries.find((e) => e.date === todayIso) ?? null;
  const competitionLoggedAny = !!(
    todayCompetition &&
    Object.values(todayCompetition.metrics ?? {}).some((v) => {
      // A finite number (including 0 and negatives) or a non-empty
      // string counts as "logged."
      if (typeof v === "number") return Number.isFinite(v);
      if (typeof v === "string") return v.trim() !== "";
      return false;
    })
  );

  // Performance status: today-anchored "any value logged" check. Most
  // performance metrics are entered periodically (quarterly), so a
  // daily completeness count would be misleading.
  const todayPerformance =
    performanceEntries.find((e) => e.date === todayIso) ?? null;
  const performanceLoggedAny = !!(
    todayPerformance &&
    Object.values(todayPerformance.metrics ?? {}).some((v) => {
      if (typeof v === "number") return Number.isFinite(v);
      if (typeof v === "string") return v.trim() !== "";
      return false;
    })
  );

  // Health CTA copy, driven by the schedule-aware counts. Three states (matches
  // prototype _updateDashStatus around HTML line 7662): caught-up success copy;
  // partial "log N remaining metric(s)"; fresh "log your N metrics for today".
  // The &nbsp; on either side of the highlight prevents the bolded pill from
  // wrapping onto its own line on narrow widths (prototype HTML line 4196).
  let healthPre: string | undefined;
  let healthHighlight: string | undefined;
  let healthPost: string | undefined;
  let healthStatus: string;
  if (healthRemainingCount === 0) {
    healthStatus =
      healthDueCount === 0
        ? "Nothing due today."
        : "Great! You've logged everything due today!";
  } else if (healthLoggedOfDue > 0) {
    healthPre = "Log ";
    healthHighlight = `${healthRemainingCount} remaining metric${healthRemainingCount === 1 ? "" : "s"}`;
    healthPost = ".";
    healthStatus = `${healthPre}${healthHighlight}${healthPost}`;
  } else {
    healthPre = "Log your ";
    healthHighlight = `${healthDueCount} metric${healthDueCount === 1 ? "" : "s"}`;
    healthPost = " for today.";
    healthStatus = `${healthPre}${healthHighlight}${healthPost}`;
  }

  const performanceStatus = performanceLoggedAny
    ? "Great! You've logged your performance data!"
    : trackedPerformanceIds.length === 0
      ? "No performance metrics tracked yet."
      : "No performance data logged today.";

  const competitionStatus = competitionLoggedAny
    ? "Great! You've logged your competition data!"
    : "No competition data logged today.";

  return (
    <div className={css.dashboardScreen}>
      {/* DashboardHeaderSlide AND SectionHeading are rendered by
          AppShell's <header> on /dashboard so the entire header stack
          stays pinned outside the scroll container. */}
      <div className={css.screenContent}>
        {/* Welcome shown only during onboarding (matches the prototype's
            .profile-welcome.show gate keyed on window.isNewUser - HTML
            around line 5088). Established users see the dashboard
            content directly. */}
        {profile && !profile.trackingSetupComplete && (
          <p className={css.dashboardWelcome}>
            <strong className={css.dashboardWelcomeTitle}>Your Dashboard</strong>
            This is your home base. Here you’ll see a snapshot of your recent
            activity, trends, and overall progress. Check back daily to stay
            on top of your goals.
          </p>
        )}

        {/* Health Log Section. Performance and Competition sections
            omit the ActivityCalendar entirely (only Health has a
            section calendar - performance / competition data is
            periodic and would render mostly empty). */}
        <div className={`${css.dashLogSection} ${css.dashHealthSection}`}>
          <ActivityCalendar
            type="health"
            trackedMetricIds={trackedHealthIds}
            healthEntries={healthEntries}
          />
          <hr className={css.sectionRule} aria-hidden="true" />
          <div className={css.dashLogLabelRow}>
            <span className={css.sectionCalToday}>
              Health Data
            </span>
          </div>
          <DashLogHeader
            type="health"
            status={healthStatus}
            pre={healthPre}
            highlight={healthHighlight}
            post={healthPost}
          />
          <DashboardChartCard
            type="health"
            trackedMetricIds={trackedHealthIds}
            healthEntries={healthEntries}
            loading={health.status === "loading"}
          />
        </div>

        <hr className={css.sectionRule} aria-hidden="true" />

        {/* Performance Log Section. No ActivityCalendar (matches the
            Competition pattern) - performance metrics are periodic
            (e.g. quarterly 1RMs, sprint times), so a daily calendar
            would render mostly empty. */}
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

        {/* Competition Log Section. Tracked-metric ids unused for the
            section header itself but forwarded to the chart card. */}
        <div className={`${css.dashLogSection} ${css.dashCompetitionSection}`}>
          <div className={css.dashLogLabelRow}>
            <span className={css.sectionCalToday}>Competition Data</span>
          </div>
          <DashLogHeader type="competition" status={competitionStatus} />
          <DashboardChartCard
            type="competition"
            trackedMetricIds={trackedCompetitionIds}
            competitionEntries={competitionEntries}
            loading={competition.status === "loading"}
          />
        </div>

        <hr className={css.sectionRule} aria-hidden="true" />

        <CodapButton />
      </div>
    </div>
  );
}
