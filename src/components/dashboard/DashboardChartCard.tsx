import { useMemo, useState } from "react";
import { MetricChart } from "../../charts/MetricChart";
import { SelectField } from "../form/SelectField";
import {
  TimeRangePicker,
  TIME_RANGE_DAYS,
  type TimeRangeKey,
} from "./TimeRangePicker";
import { WELLNESS_METRICS } from "../../metrics/wellnessMetrics";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import type { MetricDefinition } from "../../metrics/types";
import type { PerformanceEntry, WellnessEntry } from "../../types/data";
import { HISTORY, dateAtOffset, dateOffsetFromISO, toISO } from "../../utils/dates";
import { useUser } from "../../contexts/UserContext";
import {
  PROFILE_CHART_GOALS,
  DEFAULT_PROFILE_KEY,
} from "../../data/profileVariants";
import css from "./DashboardChartCard.module.css";

interface DashboardChartCardProps {
  type: "wellness" | "performance";
  trackedMetricIds: string[];
  wellnessEntries?: WellnessEntry[];
  performanceEntries?: PerformanceEntry[];
  // When true, the parent's DataContext is still loading. Render a
  // distinguishable skeleton variant of the placeholder per spec
  // "Empty data handling" - never flash zero-value axes during load.
  loading?: boolean;
}

// Look up the per-metric goal value from PROFILE_CHART_GOALS for the
// user's gender + athleteType combo. Only sleepEfficiency / protein /
// leanMass have goal values in the prototype; other metrics return
// undefined and the placeholder simply doesn't render a goal line.
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

// Wraps MetricChart placeholder + metric picker (SelectField) +
// TimeRangePicker. Reads the active metric from local state, slices the
// data array to the selected time range, and forwards through to the
// chart placeholder. The follow-up "real chart" PR swaps the placeholder
// without touching this wrapper.
export function DashboardChartCard({
  type,
  trackedMetricIds,
  wellnessEntries,
  performanceEntries,
  loading = false,
}: DashboardChartCardProps) {
  const allMetrics: MetricDefinition[] =
    type === "wellness" ? WELLNESS_METRICS : PERFORMANCE_METRICS;
  const { loadState } = useUser();
  const profile = loadState.status === "loaded" ? loadState.profile : null;
  const profileKey = profile
    ? `${capitalizeGender(profile.gender)}/${capitalizeAthleteType(profile.athleteType)}`
    : DEFAULT_PROFILE_KEY;
  const tracked = useMemo(
    () => allMetrics.filter((m) => trackedMetricIds.includes(m.id)),
    [allMetrics, trackedMetricIds],
  );

  const [selectedMetricId, setSelectedMetricId] = useState<string>(
    tracked[0]?.id ?? allMetrics[0]?.id ?? "",
  );
  const [range, setRange] = useState<TimeRangeKey>("7d");

  const metric =
    tracked.find((m) => m.id === selectedMetricId) ?? tracked[0] ?? allMetrics[0];

  const series = useMemo(
    () =>
      buildSeries({
        type,
        metricId: metric?.id ?? "",
        wellnessEntries: wellnessEntries ?? [],
        performanceEntries: performanceEntries ?? [],
        rangeDays: TIME_RANGE_DAYS[range],
      }),
    [type, metric?.id, wellnessEntries, performanceEntries, range],
  );

  const average =
    series.length > 0
      ? series.reduce((s, p) => s + p.value, 0) / series.length
      : undefined;
  const goalLine =
    metric && type === "wellness"
      ? lookupGoalLine(metric.id, profileKey)
      : undefined;

  // Compose the chart description for SR users. Includes the goal AND
  // average context the placeholder doesn't render visually but the
  // <desc> exposes - giving SR users a complete experience even before
  // the visual chart lands. Per spec line 770.
  const description = metric
    ? loading
      ? `${metric.name} chart is loading.`
      : [
          `${metric.name} over the last ${range}.`,
          goalLine !== undefined
            ? `Goal: ${formatNumber(goalLine)}${metric.unit ? ` ${metric.unit}` : ""}.`
            : null,
          average !== undefined
            ? `Recent average: ${formatNumber(average)}${metric.unit ? ` ${metric.unit}` : ""}.`
            : null,
        ]
          .filter(Boolean)
          .join(" ")
    : "No metric selected.";

  const selectOptions = tracked.map((m) => ({ value: m.id, label: m.name }));

  return (
    <div className={css.chartCard}>
      <div className={css.chartCardControls}>
        <div className={css.metricSelectWrap}>
          <SelectField
            label={
              type === "wellness"
                ? "Health & Wellness metric"
                : "Performance metric"
            }
            options={selectOptions}
            value={selectedMetricId}
            onChange={(e) => setSelectedMetricId(e.target.value)}
          />
        </div>
      </div>
      <MetricChart
        type="line"
        data={loading ? [] : series}
        goalLine={goalLine}
        averageLine={average}
        title={metric ? metric.name : "Metric"}
        description={description}
        loading={loading}
      />
      <TimeRangePicker
        value={range}
        onChange={setRange}
        ariaLabel={`${metric ? metric.name : "Metric"} time range`}
      />
    </div>
  );
}

function formatNumber(n: number): string {
  return Math.round(n * 10) / 10 + "";
}

// Profile keys in PROFILE_CHART_GOALS use prototype-style capitalized
// strings ('Male/Strength and Power', 'Female/Endurance', ...). The
// UserProfile type stores them as lowercase enum values, so map back.
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

// Build a date/value series for the selected metric over the given window.
// Skips entries outside [today - rangeDays + 1, today]. Wellness reads
// the metric off the flat WellnessEntry shape; performance reads off the
// metrics map. Non-numeric values are skipped entirely.
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

  // The data table is keyed on date; sort ascending so it reads
  // chronologically for SR users. Also produces a stable shape for the
  // future real chart's path generation.
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // Reference dateAtOffset / toISO so they're available if the future
  // real-chart swap wants to fill in zero-valued days within the window.
  void dateAtOffset;
  void toISO;
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
      // Availability is a tree, not a scalar. Return 1 if both subtrees
      // are answered, otherwise undefined. The chart placeholder doesn't
      // render this anyway; keeping it numeric avoids breaking the
      // shape contract.
      return e.availability?.practiceHeld !== null &&
        e.availability?.gameHeld !== null
        ? 1
        : undefined;
    default:
      return undefined;
  }
}
