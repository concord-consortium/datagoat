import { useId, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { MetricChart } from "./MetricChart";
import {
  TimeRangePicker,
  TIME_RANGE_DAYS,
  rangeLabel,
  rangeDescriptionPhrase,
  type TimeRangeKey,
} from "../components/dashboard/TimeRangePicker";
import { HEALTH_METRICS } from "../metrics/healthMetrics";
import { COMPETITION_METRICS } from "../metrics/competitionMetrics";
import { PERFORMANCE_METRICS } from "../metrics/performanceMetrics";
import {
  ADDABLE_HEALTH,
  ADDABLE_PERFORMANCE,
  ADDABLE_COMPETITION,
} from "../metrics/addableMetrics";
import type { MetricDefinition } from "../metrics/types";
import { useCustomMetrics } from "../contexts/CustomMetricsContext";
import { useMetricOverrides } from "../contexts/MetricOverridesContext";
import type { CustomMetricDef } from "../types/customMetrics";
import { formatSchedule, resolveSchedule } from "../types/metricSchedule";
import { DEFAULT_PROFILE_KEY } from "../data/profileVariants";
import { resolveGoalText } from "../data/metricGoals";
import { getCompTermPlural } from "../data/competitionTerms";
import { HYDRATION_HEXES } from "../data/hydrationColors";
import { useUser } from "../contexts/UserContext";
import {
  useHealthData,
  useCompetitionData,
  usePerformanceData,
} from "../contexts/DataContext";
import {
  capitalizeAthleteType,
  capitalizeGender,
  computeAverage,
  formatMetricValue,
  lookupGoalLine,
} from "./chartSeries";
import { getMetricChartConfig, useChartConfigSync } from "./metricChartConfig";
import { useChartSeries } from "./useChartSeries";
import { useDemoMode } from "../contexts/DemoModeContext";
import { If } from "../components/common/If";
import ExternalLinkIcon from "@/icons/external-link.svg?react";
import css from "./MetricDetail.module.css";

interface MetricDetailProps {
  type: "health" | "performance" | "competition";
}

// Hydration bracket labels (verbatim port of the prototype's label runs
// around HTML lines 6724-6739). Renders only on the Hydration MetricDetail
// under "Estimated Range". The hex palette lives at
// data/hydrationColors.ts so MetricInputRow can share it.

// Single-metric deep-dive view. Reuses <MetricChart> (the placeholder from
// Step 14). Adds metric info (Definition / Who Collects It / How Collected
// / Estimated Range / When Collected / References), a Learn-more link, a
// per-profile goal line, and the visually-hidden data table.
//
// Unknown :metricId falls back via <Navigate replace /> to the parent log.
// No dedicated 404 view - bouncing back is the right recovery.
export function MetricDetail({ type }: MetricDetailProps) {
  useChartConfigSync();
  const { metricId } = useParams<{ metricId: string }>();
  // Tracked + addable registries are both searched so the AddMetric
  // info button (which links into the addable space) doesn't
  // dead-end. Tracked metrics shadow addable ones with the same id.
  const allMetrics =
    type === "health"
      ? [...HEALTH_METRICS, ...ADDABLE_HEALTH]
      : type === "performance"
        ? [...PERFORMANCE_METRICS, ...ADDABLE_PERFORMANCE]
        : [...COMPETITION_METRICS, ...ADDABLE_COMPETITION];
  const { metrics: allCustom, loading: customsLoading } = useCustomMetrics();
  const { getOverride } = useMetricOverrides();
  // Match the route's :type so a health URL doesn't resolve a
  // competition-typed custom metric (and vice versa) — without the
  // metricType filter, MetricDetail would render but read from the
  // wrong entry map, producing an empty/misleading chart instead of
  // the "not found → Navigate back" branch below.
  const metric: MetricDefinition | undefined =
    allMetrics.find((m) => m.id === metricId) ??
    customAsMetricDefinition(
      allCustom.find((m) => m.id === metricId && m.metricType === type),
      type,
    );
  // Wait for the custom-metrics snapshot before deciding an unknown id
  // should redirect — otherwise a deep-link or refresh on
  // /health/c_xyz bounces back to the log before the snapshot
  // resolves the metric. Built-in ids resolve synchronously above, so
  // the gate only fires when neither a built-in nor an already-loaded
  // custom matches.
  const metricLookupLoading = !metric && customsLoading;

  const { loadState } = useUser();
  const profile = loadState.status === "loaded" ? loadState.profile : null;
  const profileKey = profile
    ? `${capitalizeGender(profile.gender)}/${capitalizeAthleteType(profile.athleteType)}`
    : DEFAULT_PROFILE_KEY;

  const health = useHealthData();
  const competition = useCompetitionData();
  const performance = usePerformanceData();
  const dataLoading =
    type === "health"
      ? health.status === "loading"
      : type === "performance"
        ? performance.status === "loading"
        : competition.status === "loading";
  const healthEntries =
    health.status === "loaded" ? health.entries : [];
  const competitionEntries =
    competition.status === "loaded" ? competition.entries : [];
  const performanceEntries =
    performance.status === "loaded" ? performance.entries : [];

  const [range, setRange] = useState<TimeRangeKey>("7d");
  const demoMode = useDemoMode();

  const series = useChartSeries({
    type,
    metricId: metric?.id ?? "",
    healthEntries,
    competitionEntries,
    performanceEntries,
    rangeDays: TIME_RANGE_DAYS[range],
    demoMode,
  });

  if (metricLookupLoading) {
    return <p className={css.loading}>Loading…</p>;
  }
  if (!metric) {
    return (
      <Navigate
        to={
          type === "health"
            ? "/health"
            : type === "performance"
              ? "/performance"
              : "/competition"
        }
        replace
      />
    );
  }

  const goalLine = lookupGoalLine(metric.id, profileKey);
  // Effective schedule: the user's per-metric override, else the metric's
  // own (built-in default or custom-def) schedule, else irregular.
  const overrideSchedule = getOverride(metric.id)?.schedule;
  const effectiveSchedule = resolveSchedule(metric.schedule, overrideSchedule);
  // Only surface the structured Schedule line when it adds information
  // beyond the prose "When / How Many Times Collected" section: i.e. the
  // user has overridden it, or there is no whenCollected prose (custom
  // metrics). Never for irregular - there is no cadence to show, and most
  // performance/competition built-ins would otherwise read "Irregular".
  const showSchedule =
    effectiveSchedule.period !== "irregular" &&
    (overrideSchedule !== undefined || !metric.whenCollected);

  const average = computeAverage(series, {
    nullsCountAsZero: getMetricChartConfig(metric.id).nullsCountAsZero,
  });

  const description = dataLoading
    ? `${metric.name} chart is loading.`
    : composeDescription(metric, range, goalLine, average);

  // Goal-line text under Estimated Range. Prototype renders only when
  // gender + athleteType are known; React port defers to the profile
  // when loaded, falls back to DEFAULT_PROFILE_KEY otherwise so the
  // sentence still reads (with the fallback profile's mapping).
  const compTermPlural = getCompTermPlural(profile?.competitionTerm ?? "");
  const goalText = resolveGoalText(metric.id, profileKey, compTermPlural);
  const profileLabel = profile
    ? `${capitalizeGender(profile.gender)} ${capitalizeAthleteType(profile.athleteType)}`
    : "[Gender] [Athlete Type]";
  const article = /^[aeiou]/i.test(profileLabel) ? "an" : "a";

  return (
    <div className={css.detailScreen}>
      <div className={css.chartSection}>
        <div className={css.chartTitle}>Your {metric.name}</div>
        <div className={css.chartDate}>{rangeLabel(range)}</div>
        <MetricChart
          type={getMetricChartConfig(metric.id).chartType}
          metricId={metric.id}
          data={dataLoading ? [] : series}
          goalLine={goalLine}
          averageLine={average}
          title={`Your ${metric.name}`}
          description={description}
          dataTableTitle={`${metric.name} data`}
          rangeKey={range}
          loading={dataLoading}
        />
        <TimeRangePicker
          value={range}
          onChange={setRange}
          ariaLabel={`${metric.name} time range`}
        />
      </div>
      <div className={css.chartDivider} aria-hidden="true" />

      <h2 className={css.infoSectionHeading}>Definition</h2>
      <div className={css.metricDescription}>
        {renderMultiline(metric.description)}
        {metric.learnMoreUrl && (
          <p className={css.learnMoreWrap}>
            <a
              className={css.learnMore}
              href={metric.learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className={css.linkText}>
                Learn more about {metric.name}{" "}
                <span className={css.linkIconWrap}>
                  <ExternalLinkIcon className={css.linkIcon} />
                </span>
              </span>
            </a>
          </p>
        )}
      </div>

      <h2 className={css.infoSectionHeading}>Who Collects It</h2>
      <div className={css.metricDescription}>
        {renderMultiline(metric.whoCollects)}
      </div>

      <h2 className={css.infoSectionHeading}>How Collected</h2>
      <div className={css.metricDescription}>
        {renderMultiline(metric.howCollected)}
      </div>

      <h2 className={css.infoSectionHeading}>Estimated Range</h2>
      <div className={css.metricDescription}>
        {metric.estimatedRange ??
          (metric.min !== undefined && metric.max !== undefined
            ? `${metric.min}–${metric.max}${metric.unit ? ` ${metric.unit}` : ""}`
            : metric.unit || "—")}
        {metric.id === "hydration" && <HydrationColorScale />}
        {goalText && (
          <p className={css.goalLine}>
            <GoalDot />
            As {article} {profileLabel} athlete, your goal is {goalText}.
          </p>
        )}
      </div>

      {metric.whenCollected && (
        <>
          <h2 className={css.infoSectionHeading}>
            When / How Many Times Collected
          </h2>
          <div className={css.metricDescription}>{metric.whenCollected}</div>
        </>
      )}

      <If condition={showSchedule}>
        <h2 className={css.infoSectionHeading}>Schedule</h2>
        <div className={css.metricDescription}>
          {formatSchedule(effectiveSchedule)}
        </div>
      </If>

      {metric.references && metric.references.length > 0 && (
        <>
          <h2 className={css.infoSectionHeading}>
            {metric.references.length > 1 ? "References" : "Reference"}
          </h2>
          <div className={css.metricDescription}>
            {metric.references.map((ref) => (
              <p key={ref.url} className={css.referenceLinkWrap}>
                <a
                  className={`${css.learnMore} ${css.referenceLink}`}
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className={css.linkText}>
                    {ref.title}{" "}
                    <span className={css.linkIconWrap}>
                      <ExternalLinkIcon className={css.linkIcon} />
                    </span>
                  </span>
                </a>
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Hydration color-scale-static swatch grid (prototype HTML 6724-6739).
// Three labeled brackets above the row of 8 numbered swatches:
// 1-3 Hydrated / 4-6 Mildly to moderately dehydrated / 7-8 Dehydrated.
function HydrationColorScale() {
  const hydratedId = useId();
  const mildId = useId();
  const dehydratedId = useId();
  const segments = [
    {
      id: hydratedId,
      label: "Hydrated",
      column: "1 / span 3",
      labelClass: css.scaleLabel,
      start: 0,
      end: 3,
    },
    {
      id: mildId,
      label: "Mildly to moderately dehydrated",
      column: "4 / span 3",
      labelClass: css.scaleLabel,
      start: 3,
      end: 6,
    },
    {
      id: dehydratedId,
      label: "Dehydrated",
      column: "7 / span 2",
      labelClass: `${css.scaleLabel} ${css.scaleLabelNoWrap}`,
      start: 6,
      end: 8,
    },
  ];
  return (
    <div
      className={css.colorScaleStatic}
      role="group"
      aria-label="Hydration color scale"
    >
      {segments.map(({ id, label, column, labelClass, start, end }) => (
        <div
          key={id}
          role="group"
          aria-labelledby={id}
          style={{ display: "contents" }}
        >
          <div
            id={id}
            className={labelClass}
            style={{ gridColumn: column, gridRow: 1 }}
          >
            {label}
          </div>
          <div
            className={css.scaleBracket}
            style={{ gridColumn: column, gridRow: 2 }}
            aria-hidden="true"
          />
          {HYDRATION_HEXES.slice(start, end).map((hex, i) => (
            <div
              key={hex}
              className={css.colorSwatch}
              style={{ background: hex, gridColumn: start + i + 1, gridRow: 3 }}
            >
              {start + i + 1}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Goal-line target dot (prototype's small SVG composed inline in
// showMetricDetail at line 6720). Filled center with a stroked outer
// ring; uses var(--text) so it inherits theme color.
function GoalDot() {
  return (
    <svg
      className={css.goalDot}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Long-form description strings ported from the prototype use "\n" line
// breaks. Render them as paragraphs so the screen reads correctly without
// requiring callers to switch to actual <br/> markup in the registry.
function renderMultiline(text: string) {
  if (!text) return <em className={css.placeholder}>Coming soon</em>;
  const parts = text.split("\n");
  return parts.map((p, i) => (
    <p key={i} className={i === 0 ? css.firstPara : undefined}>
      {p}
    </p>
  ));
}

// Adapt a CustomMetricDef into the MetricDefinition shape MetricDetail
// renders. The empty whoCollects/howCollected/description strings flow
// through renderMultiline's "Coming soon" fallback. `references` is
// intentionally absent — built-ins use it for an editorial reading
// list, which doesn't have a custom-authored equivalent. The user-
// supplied `referenceUrl` maps onto `learnMoreUrl`, which the existing
// "Learn more about <name>" link already gates on (so an empty string
// doesn't render the link).
function customAsMetricDefinition(
  def: CustomMetricDef | undefined,
  type: "health" | "performance" | "competition",
): MetricDefinition | undefined {
  if (!def) return undefined;
  return {
    id: def.id,
    name: def.name,
    unit: def.unit ?? "",
    displayUnit: def.unit ?? "",
    type,
    whoCollects: "",
    howCollected: "",
    description: "",
    inputType: def.inputType,
    learnMoreUrl: def.referenceUrl || undefined,
    schedule: def.schedule,
  };
}

function composeDescription(
  metric: MetricDefinition,
  range: TimeRangeKey,
  goalLine: number | undefined,
  average: number | undefined,
): string {
  return [
    `${metric.name} ${rangeDescriptionPhrase(range)}.`,
    goalLine !== undefined
      ? `Goal: ${formatMetricValue(metric.id, goalLine)}.`
      : null,
    average !== undefined
      ? `Recent average: ${formatMetricValue(metric.id, average)}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

