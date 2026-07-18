import { useMemo } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { DateNav } from "../layout/DateNav";
import { If } from "../common/If";
import { LogMetricRow } from "./LogMetricRow";
import { LogSection } from "./LogSection";
import { competitionTotal, winningPercentageRate } from "./CompetitionTotals";
import { isTimeMetric } from "./LogRecordInput";
import { useChartConfigSync } from "../../charts/metricChartConfig";
import { isScheduleDueOn } from "../../metrics/dueToday";
import { parseNumericInput } from "../../utils/numericInput";
import { useHealthSummaries } from "./useHealthSummaries";
import { useTrackedMetrics, type TrackedMetric } from "./useTrackedMetrics";
import { capitalizeAthleteType, capitalizeGender, formatMetricValue } from "../../charts/chartSeries";
import { DEFAULT_PROFILE_KEY } from "../../data/profileVariants";
import { SECTIONS } from "../../metrics/logSections";
import { useData } from "../../contexts/DataContext";
import { useUser } from "../../contexts/UserContext";
import {
  emptyCompetitionEntry,
  emptyHealthEntry,
  emptyPerformanceEntry,
  type HealthEntry,
} from "../../types/data";
import { HISTORY, dateAtOffset, historyOffsetFromISO, toISO } from "../../utils/dates";
import { getChipStateBy, isHealthFieldFilled } from "../../utils/healthCompleteness";
import css from "./MetricsDataEntryLog.module.css";

// Unified data-entry log. Renders every tracked metric, from all three
// metric types, grouped into frequency accordions.
//
// This is a presentation merge: the three DataContext slices, their Firestore
// collections, and the three tracked-id arrays are all still separate. Rows
// resolve to the slice that owns them. Collapsing the data model is a
// follow-up with its own story.
export function MetricsDataEntryLog() {
  const [searchParams] = useSearchParams();
  const { loadState } = useUser();
  const {
    health,
    performance,
    competition,
    setHealthEntry,
    setPerformanceEntry,
    setCompetitionEntry,
  } = useData();
  const tracked = useTrackedMetrics();

  // Subscribe the whole page to chart-config overlay changes. Custom time
  // metrics read their time layout from the overlay (isTimeMetric ->
  // getMetricChartConfig), which registers asynchronously; without a
  // subscription a custom time performance/competition row renders as a plain
  // numeric input until some unrelated re-render. useHealthSummaries also
  // subscribes, but relying on that couples this behavior to the presence of
  // health metrics - make the dependency explicit here so it survives a future
  // refactor of that hook.
  useChartConfigSync();

  const dateParam = searchParams.get("date");
  const requestedOffset = useMemo(() => {
    if (!dateParam) return HISTORY;
    return historyOffsetFromISO(dateParam);
  }, [dateParam]);

  // Malformed or out-of-range ?date= triggers a fallback Navigate. Compute the
  // flag here so all hooks below run unconditionally - returning <Navigate />
  // early would change the hook count between renders.
  const shouldRedirect =
    dateParam !== null &&
    (Number.isNaN(requestedOffset) || requestedOffset < 0 || requestedOffset > HISTORY);
  const offset =
    shouldRedirect || Number.isNaN(requestedOffset) ? HISTORY : requestedOffset;
  const displayedDate = dateAtOffset(offset);
  const dateIso = toISO(displayedDate);

  const profile = loadState.status === "loaded" ? loadState.profile : null;
  const competitionTerm = profile?.competitionTerm ?? "game";

  // Welcome guidance shown only during onboarding (matches the prototype's
  // .profile-welcome.show gate keyed on window.isNewUser). Established users
  // with a complete profile see only the frequency accordions. The three
  // per-type logs each had their own copy; the merged page carries one block
  // covering every metric type.
  const isOnboarding =
    loadState.status === "missing" ||
    (loadState.status === "loaded" &&
      (!loadState.profile.profileComplete ||
        !loadState.profile.trackingSetupComplete));
  const profileKey = profile
    ? `${capitalizeGender(profile.gender)}/${capitalizeAthleteType(profile.athleteType)}`
    : DEFAULT_PROFILE_KEY;

  const healthEntries = health.status === "loaded" ? health.entries : [];
  const performanceEntries = performance.status === "loaded" ? performance.entries : [];
  const competitionEntries = competition.status === "loaded" ? competition.entries : [];

  // Merge over emptyHealthEntry defaults so partially-saved docs still expose
  // every field the UI reads. Without this, toggling availability on after
  // logging other metrics hands AvailabilityTree an undefined value and
  // crashes.
  const foundHealth = healthEntries.find((e) => e.date === dateIso);
  const healthEntry: HealthEntry = foundHealth
    ? { ...emptyHealthEntry(dateIso), ...foundHealth }
    : emptyHealthEntry(dateIso);
  const performanceEntry =
    performanceEntries.find((e) => e.date === dateIso) ?? emptyPerformanceEntry(dateIso);
  const competitionEntry =
    competitionEntries.find((e) => e.date === dateIso) ?? emptyCompetitionEntry(dateIso);

  const trackedHealthIds = useMemo(
    () => tracked.filter((m) => m.type === "health").map((m) => m.id),
    [tracked],
  );
  const summaryFor = useHealthSummaries(trackedHealthIds, healthEntries, profileKey);

  // One chip across every tracked metric, whatever slice owns it - a chip that
  // counted only health would under-report on a page showing everything. But
  // "complete for this day" means the metrics actually scheduled today: the
  // due-today engine counts daily every day and weekly on its anchor weekdays,
  // and never counts monthly/quarterly/yearly/as-needed (they don't nag on
  // dates we'd have to invent). Counting those not-due cadences would leave
  // "All" permanently unreachable for anyone tracking one. relativeProteinIntake
  // is excluded too: it's an auto-calculated placeholder with no input, so it
  // can never be "filled" and would also pin the chip below "All".
  const dueMetrics = tracked.filter(
    (m) =>
      m.id !== "relativeProteinIntake" &&
      m.schedule !== undefined &&
      isScheduleDueOn(m.schedule, displayedDate),
  );
  const dueById = new Map(dueMetrics.map((m) => [m.id, m]));
  const chipState = getChipStateBy(
    dueMetrics.map((m) => m.id),
    (id) => {
      const m = dueById.get(id);
      if (!m) return false;
      if (m.type === "health") return isHealthFieldFilled(healthEntry, id);
      const entry = m.type === "performance" ? performanceEntry : competitionEntry;
      const v = entry.metrics?.[id];
      if (typeof v === "number") return Number.isFinite(v);
      if (typeof v === "string") return v.trim() !== "";
      return false;
    },
  );

  if (shouldRedirect) {
    return <Navigate to="/log" replace />;
  }

  function setPerformanceValue(metricId: string, raw: string) {
    const value = parseNumericInput(raw);
    if (value === null) return;
    setPerformanceEntry(dateIso, { metrics: { [metricId]: value } });
  }

  function setCompetitionValue(metricId: string, raw: string) {
    const value = parseNumericInput(raw);
    if (value === null) return;
    setCompetitionEntry(dateIso, { metrics: { [metricId]: value } });
  }

  // Leftmost cell for a non-health row. Competition keeps its running total
  // (and the derived win rate); Performance keeps the current day's value.
  // Both are preserved as-is: this story reorganizes rows, it does not
  // redefine what they show.
  function summaryCellFor(m: TrackedMetric): string {
    if (m.type === "competition") {
      if (m.id === "winningPercentage") {
        const rate = winningPercentageRate(competitionEntries);
        return rate === undefined ? "" : `${rate}%`;
      }
      const total = competitionTotal(competitionEntries, m.id);
      if (total === undefined) return "";
      return isTimeMetric(m.id) ? formatMetricValue(m.id, total) : String(total);
    }
    const live = performanceEntry.metrics?.[m.id];
    if (typeof live === "number" && Number.isFinite(live)) {
      return isTimeMetric(m.id) ? formatMetricValue(m.id, live) : String(live);
    }
    return typeof live === "string" ? live : "";
  }

  return (
    <>
      <DateNav offset={offset} withChip chipState={chipState} />
      <div className={css.screenContent}>
        <If condition={isOnboarding}>
          <div className={css.profileWelcome}>
            <h2 className={css.profileWelcomeTitle}>Your Metrics Log</h2>
            <p>
              Record every metric your team tracks here, grouped by how often
              it's due. Logging consistently - even on rest days - helps you
              and your team spot patterns over time.
            </p>
          </div>
        </If>
        {SECTIONS.map((section) => {
          const rows = tracked.filter((m) => m.section === section);
          return (
            <LogSection
              key={section}
              section={section}
              count={rows.length}
              defaultOpen={section === "daily"}
            >
              {rows.map((m) => (
                <LogMetricRow
                  key={m.id}
                  tracked={m}
                  healthEntry={healthEntry}
                  performanceEntry={performanceEntry}
                  competitionEntry={competitionEntry}
                  summary={summaryFor(m.id)}
                  summaryCell={summaryCellFor(m)}
                  competitionTerm={competitionTerm}
                  setHealth={(partial) => setHealthEntry(dateIso, partial)}
                  setPerformance={(raw) => setPerformanceValue(m.id, raw)}
                  setCompetition={(raw) => setCompetitionValue(m.id, raw)}
                />
              ))}
            </LogSection>
          );
        })}
      </div>
    </>
  );
}
