import type { PerformanceEntry, WellnessEntry } from "../types/data";
import { daysAgoFromISO, isoAtDaysAgo } from "../utils/dates";
import { PROFILE_CHART_GOALS } from "../data/profileVariants";
import { getMetricChartConfig } from "./metricChartConfig";

// Resolve the chart goal line for a metric in raw units.
// Per-profile goals from PROFILE_CHART_GOALS take precedence; metrics
// without a per-profile entry fall back to the static goal in
// metricChartConfig (e.g., Hydration's 3, Availability's 80%).
export function lookupGoalLine(
  metricId: string,
  profileKey: string,
): number | undefined {
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
export function buildSeries({
  type,
  metricId,
  wellnessEntries,
  performanceEntries,
  rangeDays,
}: BuildSeriesArgs): Array<{ date: string; value: number }> {
  const out: Array<{ date: string; value: number }> = [];

  if (type === "wellness") {
    for (const e of wellnessEntries) {
      const days = daysAgoFromISO(e.date);
      if (Number.isNaN(days) || days >= rangeDays) continue;
      const value = readWellnessMetric(e, metricId);
      if (value === undefined) continue;
      out.push({ date: e.date, value });
    }
  } else {
    for (const e of performanceEntries) {
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

export function readWellnessMetric(
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

// Same args as buildSeries, but emits one entry per day in the range
// (oldest first, today last) with null for days with no entry. The
// bar chart consumes this so it can render today-ghost when today is
// null and leave empty slots for missing past days.
//
// Performance metrics: 0 is preserved (valid score). Wellness metrics:
// 0 is treated as "not logged" (matches buildSeries / readWellnessMetric).
export function buildAlignedSeries({
  type,
  metricId,
  wellnessEntries,
  performanceEntries,
  rangeDays,
}: BuildSeriesArgs): Array<{ date: string; value: number | null }> {
  const valueByDate = new Map<string, number>();

  if (type === "wellness") {
    for (const e of wellnessEntries) {
      const v = readWellnessMetric(e, metricId);
      if (v !== undefined) valueByDate.set(e.date, v);
    }
  } else {
    for (const e of performanceEntries) {
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
