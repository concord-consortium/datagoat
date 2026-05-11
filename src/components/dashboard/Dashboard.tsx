import { ActivityCalendar } from "./ActivityCalendar";
import { DashLogHeader } from "./DashLogHeader";
import { DashboardChartCard } from "./DashboardChartCard";
import { CodapButton } from "./CodapButton";
import { useUser } from "../../contexts/UserContext";
import { useData } from "../../contexts/DataContext";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { COMPETITION_METRICS } from "../../metrics/competitionMetrics";
import { HISTORY, dateAtOffset, toISO } from "../../utils/dates";
import { getChipState } from "../../utils/healthCompleteness";
import css from "./Dashboard.module.css";

// Dashboard scaffold: header carousel + welcome + activity calendars +
// log CTAs. Chart cards are added in Step 14 (placeholder gray-box +
// metric picker + TimeRangePicker + CodapButton).
export function Dashboard() {
  const { loadState } = useUser();
  const { health, competition } = useData();

  const profile = loadState.status === "loaded" ? loadState.profile : null;

  const trackedHealthIds =
    profile?.trackedHealthMetrics ?? HEALTH_METRICS.map((m) => m.id);
  const trackedCompetitionIds =
    profile?.trackedCompetitionMetrics ?? COMPETITION_METRICS.map((m) => m.id);

  const healthEntries =
    health.status === "loaded" ? health.entries : [];
  const competitionEntries =
    competition.status === "loaded" ? competition.entries : [];

  // Compute today's health completeness for the CTA copy.
  const todayIso = toISO(dateAtOffset(HISTORY));
  const todayHealth =
    healthEntries.find((e) => e.date === todayIso) ?? null;
  const healthChip = getChipState(todayHealth, trackedHealthIds);
  const healthLogged = countHealthLogged(
    todayHealth,
    trackedHealthIds,
  );

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

  // Health CTA copy. Three states (matches prototype _updateDashStatus
  // around HTML line 7662): all-logged success copy; partial "log N
  // remaining metric(s)"; empty "log your N metrics for today". The
  // &nbsp; on either side of the highlight prevents the bolded pill
  // from wrapping onto its own line on narrow widths (prototype HTML
  // line 4196).
  const healthRemaining = trackedHealthIds.length - healthLogged;
  let healthPre: string | undefined;
  let healthHighlight: string | undefined;
  let healthPost: string | undefined;
  let healthStatus: string;
  if (healthChip === "all") {
    healthStatus = "Great! You've logged all your health & performance data!";
  } else if (healthLogged > 0) {
    healthPre = "Log ";
    healthHighlight = `${healthRemaining} remaining metric${healthRemaining === 1 ? "" : "s"}`;
    healthPost = ".";
    healthStatus = `${healthPre}${healthHighlight}${healthPost}`;
  } else {
    healthPre = "Log your ";
    healthHighlight = `${trackedHealthIds.length} metric${trackedHealthIds.length === 1 ? "" : "s"}`;
    healthPost = " for today.";
    healthStatus = `${healthPre}${healthHighlight}${healthPost}`;
  }

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

        {/* Health & Performance Log Section. Competition section omits the
            ActivityCalendar entirely, matching the prototype's dashboard
            layout (only health has a section calendar at HTML line
            4170-4187; competition section starts with dash-log-label-row
            directly at line 4225). */}
        <div className={`${css.dashLogSection} ${css.dashHealthSection}`}>
          <ActivityCalendar
            type="health"
            trackedMetricIds={trackedHealthIds}
            healthEntries={healthEntries}
          />
          <hr className={css.sectionRule} aria-hidden="true" />
          <div className={css.dashLogLabelRow}>
            <span className={css.sectionCalToday}>
              Health & Performance Data
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

function countHealthLogged(
  entry: Parameters<typeof getChipState>[0],
  trackedIds: string[],
): number {
  let n = 0;
  for (const id of trackedIds) {
    if (getChipState(entry, [id]) !== "none") n++;
  }
  return n;
}
