import type {
  CompetitionEntry,
  HealthEntry,
  PerformanceEntry,
} from "../types/data";
import { daysAgoFromISO, isoAtDaysAgo } from "../utils/dates";
import { PROFILE_CHART_GOALS } from "../data/profileVariants";
import { getMetricChartConfig, getMetricOverride } from "./metricChartConfig";

// Resolve the chart goal line for a metric in raw units. Precedence:
//   1. a user metric override (getMetricOverride) — beats everything;
//   2. per-profile goals from PROFILE_CHART_GOALS;
//   3. the static goal in metricChartConfig (e.g., Hydration's 3,
//      Availability's 80%).
export function lookupGoalLine(
  metricId: string,
  profileKey: string,
): number | undefined {
  // A user override of the goal wins over every default — including
  // the profile-keyed goals below.
  const override = getMetricOverride(metricId);
  if (override?.goalRaw !== undefined) {
    return override.goalRaw;
  }
  const goals = PROFILE_CHART_GOALS[profileKey];
  if (goals) {
    switch (metricId) {
      case "sleepEfficiency":
        return goals.sleepEffGoal;
      case "protein":
        return goals.proteinGoal;
      case "leanMass":
        return goals.leanMassGoal;
      case "goals":
        return goals.goalsGoal;
      case "assists":
        return goals.assistsGoal;
      case "yards":
        return goals.yardsGoal;
      case "tackles":
        return goals.tacklesGoal;
    }
  }
  return getMetricChartConfig(metricId).goalRaw;
}

// Format a raw metric value for narrative text (chart screen-reader
// descriptions, etc.) using the same per-metric rules as the chart
// badges: avgDecimals for rounding, formatValue for inseparable
// suffixes like "%", and config.unit for separable units like "kg".
//
// Examples:
//   formatMetricValue("sleepEfficiency", 82.5) → "83%"  (avgDecimals: 0)
//   formatMetricValue("leanMass", 65)          → "65 kg"
//   formatMetricValue("protein", 1.42)         → "1.4 g/kg"
//   formatMetricValue("hydration", 3)          → "3"
export function formatMetricValue(metricId: string, raw: number): string {
  const config = getMetricChartConfig(metricId);
  const decimals = config.avgDecimals ?? 1;
  const rounded = Number(raw.toFixed(decimals));
  const formatted = config.formatValue(rounded);
  return config.unit ? `${formatted} ${config.unit}` : formatted;
}

// Profile keys in PROFILE_CHART_GOALS use prototype-style capitalized
// strings ('Male/Strength and Power', 'Female/Endurance', ...). The
// UserProfile type stores them as lowercase enum values, so map back.
export function capitalizeGender(g: string): string {
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

export function capitalizeAthleteType(t: string): string {
  return t === "endurance" ? "Endurance" : "Strength and Power";
}

export interface BuildSeriesArgs {
  type: "health" | "performance" | "competition";
  metricId: string;
  healthEntries: HealthEntry[];
  competitionEntries: CompetitionEntry[];
  // Optional during the transition: only the new Performance section
  // and dashboard card pass this. Older call sites that pre-date the
  // Performance section leave it undefined; the "performance" branch
  // below treats undefined as an empty list.
  performanceEntries?: PerformanceEntry[];
  rangeDays: number;
}

// Build a date/value series for the selected metric over the given window.
// Skips entries outside [today - rangeDays + 1, today]. Health reads
// the metric off the flat HealthEntry shape; competition reads off the
// metrics map. Non-numeric values are skipped entirely.
export function buildSeries({
  type,
  metricId,
  healthEntries,
  competitionEntries,
  performanceEntries,
  rangeDays,
}: BuildSeriesArgs): Array<{ date: string; value: number }> {
  const out: Array<{ date: string; value: number }> = [];

  if (type === "health") {
    for (const e of healthEntries) {
      const days = daysAgoFromISO(e.date);
      if (Number.isNaN(days) || days >= rangeDays) continue;
      const value = readHealthMetric(e, metricId);
      if (value === undefined) continue;
      out.push({ date: e.date, value });
    }
  } else if (type === "performance") {
    for (const e of performanceEntries ?? []) {
      const days = daysAgoFromISO(e.date);
      if (Number.isNaN(days) || days >= rangeDays) continue;
      const raw = e.metrics?.[metricId];
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      out.push({ date: e.date, value: raw });
    }
  } else {
    for (const e of competitionEntries) {
      const days = daysAgoFromISO(e.date);
      if (Number.isNaN(days) || days >= rangeDays) continue;
      const raw = e.metrics?.[metricId];
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      out.push({ date: e.date, value: raw });
    }
  }

  // The data table is keyed on date; sort ascending so it reads
  // chronologically for SR users. Also produces a stable shape for the
  // future real chart's path generation.
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export function readHealthMetric(
  e: HealthEntry,
  metricId: string,
): number | undefined {
  switch (metricId) {
    case "hydration":
      return typeof e.hydration === "number" && Number.isFinite(e.hydration)
        ? e.hydration
        : undefined;
    case "sleepTime":
      return typeof e.sleepTime === "number" && Number.isFinite(e.sleepTime)
        ? e.sleepTime
        : undefined;
    case "sleepEfficiency":
      return typeof e.sleepEfficiency === "number" &&
        Number.isFinite(e.sleepEfficiency)
        ? e.sleepEfficiency
        : undefined;
    case "protein":
      return typeof e.protein === "number" && Number.isFinite(e.protein)
        ? e.protein
        : undefined;
    case "leanMass":
      return typeof e.leanMass === "number" && Number.isFinite(e.leanMass)
        ? e.leanMass
        : undefined;
    case "availability":
      // Availability is a tree, not a scalar. Return 1 if both subtrees
      // are answered, otherwise undefined. The chart placeholder doesn't
      // render this anyway; keeping it numeric avoids breaking the
      // shape contract.
      return typeof e.availability?.practiceHeld === "boolean" &&
        typeof e.availability?.gameHeld === "boolean"
        ? 1
        : undefined;
    default: {
      // Custom health metric ids: values live in entry.customMetrics
      // rather than as typed fields. A stored 0 is valid data and flows
      // through unchanged; only non-numeric / non-finite / absent values
      // become undefined (the "not logged" state).
      const raw = e.customMetrics?.[metricId];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        return raw;
      }
      return undefined;
    }
  }
}

// Same args as buildSeries, but emits one entry per day in the range
// (oldest first, today last) with null for days with no entry. The
// bar chart consumes this so it can render today-ghost when today is
// null and leave empty slots for missing past days.
//
// 0 is preserved as valid data for both health and competition metrics.
// "Not logged" is encoded as undefined / missing key, propagating to
// null in the aligned output for the chart's empty-slot rendering.
export function buildAlignedSeries({
  type,
  metricId,
  healthEntries,
  competitionEntries,
  performanceEntries,
  rangeDays,
}: BuildSeriesArgs): Array<{ date: string; value: number | null }> {
  const valueByDate = new Map<string, number>();

  if (type === "health") {
    for (const e of healthEntries) {
      const v = readHealthMetric(e, metricId);
      if (v !== undefined) valueByDate.set(e.date, v);
    }
  } else if (type === "performance") {
    for (const e of performanceEntries ?? []) {
      const raw = e.metrics?.[metricId];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        valueByDate.set(e.date, raw);
      }
    }
  } else {
    for (const e of competitionEntries) {
      const raw = e.metrics?.[metricId];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        valueByDate.set(e.date, raw);
      }
    }
  }

  const out: Array<{ date: string; value: number | null }> = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const date = isoAtDaysAgo(i);
    const v = valueByDate.get(date);
    out.push({ date, value: v === undefined ? null : v });
  }
  return out;
}

// Compute the average over a date-aligned series. Default behavior:
// filter nulls and average over the days that have data. When
// `nullsCountAsZero` is true, nulls are treated as 0 and the divisor
// is the full series length — useful for availability-style metrics
// where a missing entry semantically means "not available."
export function computeAverage(
  series: Array<{ value: number | null }>,
  options: { nullsCountAsZero?: boolean } = {},
): number | undefined {
  if (options.nullsCountAsZero) {
    if (series.length === 0) return undefined;
    const sum = series.reduce((s, d) => s + (d.value ?? 0), 0);
    return sum / series.length;
  }
  const filled = series
    .map((d) => d.value)
    .filter((v): v is number => v !== null);
  if (filled.length === 0) return undefined;
  return filled.reduce((s, v) => s + v, 0) / filled.length;
}
