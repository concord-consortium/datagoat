import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { MetricChart } from "./MetricChart";
import {
  TimeRangePicker,
  TIME_RANGE_DAYS,
  type TimeRangeKey,
} from "../components/dashboard/TimeRangePicker";
import { WELLNESS_METRICS } from "../metrics/wellnessMetrics";
import { PERFORMANCE_METRICS } from "../metrics/performanceMetrics";
import {
  ADDABLE_WELLNESS,
  ADDABLE_PERFORMANCE,
} from "../metrics/addableMetrics";
import type { MetricDefinition } from "../metrics/types";
import {
  PROFILE_CHART_GOALS,
  DEFAULT_PROFILE_KEY,
} from "../data/profileVariants";
import { resolveGoalText } from "../data/metricGoals";
import { useUser } from "../contexts/UserContext";
import {
  useWellnessData,
  usePerformanceData,
} from "../contexts/DataContext";
import type { PerformanceEntry, WellnessEntry } from "../types/data";
import { HISTORY, dateOffsetFromISO } from "../utils/dates";
import ExternalLinkIcon from "@/icons/external-link.svg?react";
import css from "./MetricDetail.module.css";

interface MetricDetailProps {
  type: "wellness" | "performance";
}

// Hydration color-scale palette + bracket labels (verbatim port of the
// prototype's hydrationHexes + label runs around HTML lines 6724-6739).
// Renders only on the Hydration MetricDetail under "Estimated Range".
const HYDRATION_HEXES = [
  "#F9F7DA",
  "#FFFAC7",
  "#FFF585",
  "#FFF234",
  "#FFEE70",
  "#FFEA41",
  "#DBC37A",
  "#A7944B",
];

// Single-metric deep-dive view. Reuses <MetricChart> (the placeholder from
// Step 14). Adds metric info (Definition / Who Collects It / How Collected
// / Estimated Range / When Collected / References), a Learn-more link, a
// per-profile goal line, and the visually-hidden data table.
//
// Unknown :metricId falls back via <Navigate replace /> to the parent log.
// No dedicated 404 view - bouncing back is the right recovery.
export function MetricDetail({ type }: MetricDetailProps) {
  const { metricId } = useParams<{ metricId: string }>();
  // Tracked + addable registries are both searched so the AddMetric
  // info button (which links into the addable space) doesn't
  // dead-end. Tracked metrics shadow addable ones with the same id.
  const allMetrics =
    type === "wellness"
      ? [...WELLNESS_METRICS, ...ADDABLE_WELLNESS]
      : [...PERFORMANCE_METRICS, ...ADDABLE_PERFORMANCE];
  const metric = allMetrics.find((m) => m.id === metricId);

  const { loadState } = useUser();
  const profile = loadState.status === "loaded" ? loadState.profile : null;
  const profileKey = profile
    ? `${capitalizeGender(profile.gender)}/${capitalizeAthleteType(profile.athleteType)}`
    : DEFAULT_PROFILE_KEY;

  const wellness = useWellnessData();
  const performance = usePerformanceData();
  const dataLoading =
    type === "wellness"
      ? wellness.status === "loading"
      : performance.status === "loading";
  const wellnessEntries =
    wellness.status === "loaded" ? wellness.entries : [];
  const performanceEntries =
    performance.status === "loaded" ? performance.entries : [];

  const [range, setRange] = useState<TimeRangeKey>("7d");

  const series = useMemo(
    () =>
      metric
        ? buildSeries({
            type,
            metricId: metric.id,
            wellnessEntries,
            performanceEntries,
            rangeDays: TIME_RANGE_DAYS[range],
          })
        : [],
    [type, metric, wellnessEntries, performanceEntries, range],
  );

  if (!metric) {
    return (
      <Navigate
        to={type === "wellness" ? "/wellness" : "/performance"}
        replace
      />
    );
  }

  const goalLine =
    type === "wellness" ? lookupGoalLine(metric.id, profileKey) : undefined;
  const average =
    series.length > 0
      ? series.reduce((s, p) => s + p.value, 0) / series.length
      : undefined;

  const description = dataLoading
    ? `${metric.name} chart is loading.`
    : composeDescription(metric, range, goalLine, average);

  // Goal-line text under Estimated Range. Prototype renders only when
  // gender + athleteType are known; React port defers to the profile
  // when loaded, falls back to DEFAULT_PROFILE_KEY otherwise so the
  // sentence still reads (with the fallback profile's mapping).
  const compTermPlural = profile?.competitionTerm
    ? `${profile.competitionTerm}s`
    : "games";
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
          type={chartTypeFor(metric.id)}
          data={dataLoading ? [] : series}
          goalLine={goalLine}
          averageLine={average}
          title={`Your ${metric.name}`}
          description={description}
          dataTableTitle={`${metric.name} data`}
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
  return (
    <div
      className={css.colorScaleStatic}
      aria-label="Hydration color scale"
    >
      <div className={css.scaleLabel} style={{ gridColumn: "1 / span 3" }}>
        Hydrated
      </div>
      <div className={css.scaleLabel} style={{ gridColumn: "4 / span 3" }}>
        Mildly to moderately dehydrated
      </div>
      <div
        className={`${css.scaleLabel} ${css.scaleLabelNoWrap}`}
        style={{ gridColumn: "7 / span 2" }}
      >
        Dehydrated
      </div>
      <div className={css.scaleBracket} style={{ gridColumn: "1 / span 3" }} />
      <div className={css.scaleBracket} style={{ gridColumn: "4 / span 3" }} />
      <div className={css.scaleBracket} style={{ gridColumn: "7 / span 2" }} />
      {HYDRATION_HEXES.map((hex, i) => (
        <div
          key={hex}
          className={css.colorSwatch}
          style={{ background: hex }}
          aria-label={`Level ${i + 1}`}
        >
          {i + 1}
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

function rangeLabel(range: TimeRangeKey): string {
  switch (range) {
    case "7d":
      return "Last 7 days";
    case "2w":
      return "Last 2 weeks";
    case "30d":
      return "Last 30 days";
    case "3mo":
      return "Last 3 months";
    case "6mo":
      return "Last 6 months";
    case "All":
      return "All time";
  }
}

function composeDescription(
  metric: MetricDefinition,
  range: TimeRangeKey,
  goalLine: number | undefined,
  average: number | undefined,
): string {
  return [
    `${metric.name} over the ${rangeLabel(range).toLowerCase()}.`,
    goalLine !== undefined
      ? `Goal: ${formatNumber(goalLine)}${metric.unit ? ` ${metric.unit}` : ""}.`
      : null,
    average !== undefined
      ? `Recent average: ${formatNumber(average)}${metric.unit ? ` ${metric.unit}` : ""}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatNumber(n: number): string {
  return Math.round(n * 10) / 10 + "";
}

// Per-metric chart type. The prototype renders Sleep Time + Protein as
// bars (daily totals stack-style); other wellness metrics + performance
// metrics render as lines. The placeholder doesn't draw differently per
// type, but the prop is forwarded so the future real-chart PR picks the
// correct primitive.
function chartTypeFor(metricId: string): "line" | "bar" {
  return metricId === "sleepTime" || metricId === "protein" ? "bar" : "line";
}

function lookupGoalLine(
  metricId: string,
  profileKey: string,
): number | undefined {
  const goals = PROFILE_CHART_GOALS[profileKey];
  if (!goals) return undefined;
  switch (metricId) {
    case "sleepEfficiency":
      return goals.sleepEffGoal;
    case "protein":
      return goals.proteinGoal;
    case "leanMass":
      return goals.leanMassGoal;
    default:
      return undefined;
  }
}

function capitalizeGender(g: string): string {
  switch (g) {
    case "male":
      return "Male";
    case "female":
      return "Female";
    case "non-binary":
      return "Non-binary";
    default:
      return "Unspecified";
  }
}

function capitalizeAthleteType(t: string): string {
  return t === "endurance" ? "Endurance" : "Strength and Power";
}

interface BuildSeriesArgs {
  type: "wellness" | "performance";
  metricId: string;
  wellnessEntries: WellnessEntry[];
  performanceEntries: PerformanceEntry[];
  rangeDays: number;
}

// Build the date/value series for the selected metric over the given
// window. Mirrors DashboardChartCard's buildSeries - kept inline (not
// extracted to a util) because the wellness vs performance shape access
// differs and the future real-chart PR will swap these consumers in
// lockstep.
function buildSeries({
  type,
  metricId,
  wellnessEntries,
  performanceEntries,
  rangeDays,
}: BuildSeriesArgs): Array<{ date: string; value: number }> {
  const out: Array<{ date: string; value: number }> = [];
  const todayOffset = HISTORY;
  const minOffset = Math.max(0, todayOffset - rangeDays + 1);

  if (type === "wellness") {
    for (const e of wellnessEntries) {
      const offset = dateOffsetFromISO(e.date);
      if (Number.isNaN(offset) || offset < minOffset || offset > todayOffset)
        continue;
      const value = readWellnessMetric(e, metricId);
      if (value === undefined) continue;
      out.push({ date: e.date, value });
    }
  } else {
    for (const e of performanceEntries) {
      const offset = dateOffsetFromISO(e.date);
      if (Number.isNaN(offset) || offset < minOffset || offset > todayOffset)
        continue;
      const raw = e.metrics?.[metricId];
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      out.push({ date: e.date, value: raw });
    }
  }

  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

function readWellnessMetric(
  e: WellnessEntry,
  metricId: string,
): number | undefined {
  switch (metricId) {
    case "hydration":
      return e.hydration > 0 ? e.hydration : undefined;
    case "sleepTime":
      return e.sleepTime > 0 ? e.sleepTime : undefined;
    case "sleepEfficiency":
      return e.sleepEfficiency > 0 ? e.sleepEfficiency : undefined;
    case "protein":
      return e.protein > 0 ? e.protein : undefined;
    case "leanMass":
      return e.leanMass > 0 ? e.leanMass : undefined;
    case "availability":
      return e.availability?.practiceHeld !== null &&
        e.availability?.gameHeld !== null
        ? 1
        : undefined;
    default:
      return undefined;
  }
}
