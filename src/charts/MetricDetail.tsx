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
import type { MetricDefinition } from "../metrics/types";
import {
  PROFILE_CHART_GOALS,
  DEFAULT_PROFILE_KEY,
} from "../data/profileVariants";
import { useUser } from "../contexts/UserContext";
import {
  useWellnessData,
  usePerformanceData,
} from "../contexts/DataContext";
import type { PerformanceEntry, WellnessEntry } from "../types/data";
import { HISTORY, dateOffsetFromISO } from "../utils/dates";
import css from "./MetricDetail.module.css";

interface MetricDetailProps {
  type: "wellness" | "performance";
}

// Single-metric deep-dive view. Reuses <MetricChart> (the placeholder from
// Step 14). Adds metric info (Definition / Who Collects It / How Collected
// / Estimated Range / When Collected), goal/average lines forwarded to the
// placeholder, and the visually-hidden data table - which IS real and
// works on this screen, so screen-reader users have a complete experience
// even before the visual chart lands.
//
// Unknown :metricId falls back via <Navigate replace /> to the parent log.
// No dedicated 404 view - bouncing back is the right recovery.
export function MetricDetail({ type }: MetricDetailProps) {
  const { metricId } = useParams<{ metricId: string }>();
  const allMetrics =
    type === "wellness" ? WELLNESS_METRICS : PERFORMANCE_METRICS;
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

      <h3 className={css.infoSectionHeading}>Definition</h3>
      <div className={css.metricDescription}>
        {renderMultiline(metric.description)}
      </div>

      <h3 className={css.infoSectionHeading}>Who Collects It</h3>
      <div className={css.metricDescription}>
        {renderMultiline(metric.whoCollects)}
      </div>

      <h3 className={css.infoSectionHeading}>How Collected</h3>
      <div className={css.metricDescription}>
        {renderMultiline(metric.howCollected)}
      </div>

      <h3 className={css.infoSectionHeading}>Estimated Range</h3>
      <div className={css.metricDescription}>
        {metric.min !== undefined && metric.max !== undefined
          ? `${metric.min}–${metric.max}${metric.unit ? ` ${metric.unit}` : ""}`
          : metric.unit || "—"}
      </div>

      {metric.hint && (
        <>
          <h3 className={css.infoSectionHeading}>
            When / How Many Times Collected
          </h3>
          <div className={css.metricDescription}>{metric.hint}</div>
        </>
      )}
    </div>
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
