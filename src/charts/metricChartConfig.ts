// Per-metric chart configuration. Single source of truth for chart type,
// axis range, axis inversion, value formatting, the demo-mode random
// generator, and (for metrics whose goal does not vary by profile) a
// static goal value.
//
// Metrics whose goal IS profile-keyed (sleepEfficiency, protein, leanMass)
// leave goalRaw undefined — chartSeries.lookupGoalLine resolves those
// against PROFILE_CHART_GOALS and falls back to this table for the rest.
//
// Content can revise these values freely; the chart engine reads only
// the resolved fields below and does not assume any metric is special.

import { useSyncExternalStore } from "react";
import { randomFloat, randomInt } from "./randomValues";
import type { CustomMetricDef } from "../types/customMetrics";

export interface MetricChartConfig {
  chartType: "bar" | "line";
  yTopRaw: number;
  yBottomRaw: number;
  // When true, the "top of plot" corresponds to yTopRaw being numerically
  // smaller than yBottomRaw (Hydration's 1..8 urine-color scale: 1 = best,
  // displayed at the top). Default false: yBottomRaw < yTopRaw, top = max.
  inverted?: boolean;
  // Static goal value in raw units. Profile-keyed metrics omit this and
  // resolve via PROFILE_CHART_GOALS instead.
  goalRaw?: number;
  // Format a raw value for display in axis labels and goal/avg badges.
  // Returns the bare number (no unit). The unit, if any, is appended by
  // the chart components according to the unit / showUnitOnGoalBadge
  // rules below. Percent metrics keep their "%" inside formatValue
  // because the suffix is inseparable from the number.
  formatValue: (raw: number) => string;
  // Optional separable unit ("kg", "g/kg", "h") shown on the top y-axis
  // label and on the average badge (always when present). Never shown
  // on the bottom y-axis label. Use formatValue for inseparable
  // suffixes (%).
  unit?: string;
  // True when the unit string is too wide to render comfortably inline
  // (e.g. "g/kg"). Long units get stacked on a second line under the
  // y-axis top label and are dropped from the goal badge. Short units
  // (default; e.g. "kg", "h") render inline next to the value
  // everywhere they appear.
  isLongUnit?: boolean;
  // Decimals to round the computed average to before formatting. Default
  // is 1 (so e.g. sleepTime's avg renders as "8.3" not "8.283333..."").
  // Set to 0 for metrics whose averages should read as integers (e.g.
  // sleepEfficiency: "Avg: 82%").
  avgDecimals?: number;
  // When true, nulls (missing days) count as 0 in the average — useful
  // for availability-style metrics where "no entry" semantically means
  // "not available." Default: nulls are filtered out of the average.
  nullsCountAsZero?: boolean;
  // Demo-mode random generator (consumed only when the user opens the
  // app with `?demo`). Receives a seeded RNG returning 0..1 floats and
  // returns a typical raw value. Real data flows through Firestore.
  random: (rng: () => number) => number;
}

const fmtRaw = (v: number) => `${v}`;
const fmtPct = (v: number) => `${v}%`;

// Health metrics
const HYDRATION: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 1,
  yBottomRaw: 8,
  inverted: true,
  goalRaw: 3,
  formatValue: fmtRaw,
  random: (rng) => randomInt(rng, 1, 5),
};

const SLEEP_TIME: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 10,
  yBottomRaw: 0,
  goalRaw: 8, // 7-9 hr typical recommendation; pick midpoint as static default
  formatValue: fmtRaw,
  unit: "h",
  random: (rng) => randomFloat(rng, 6, 10, 1),
};

const SLEEP_EFFICIENCY: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 100,
  yBottomRaw: 0,
  // goal is profile-keyed via PROFILE_CHART_GOALS.sleepEffGoal
  formatValue: fmtPct,
  avgDecimals: 0,
  random: (rng) => randomInt(rng, 50, 100),
};

const PROTEIN: MetricChartConfig = {
  chartType: "bar",
  // 0..2.5 g/kg/day covers all four canonical profiles' proteinMax.
  // Per-profile y-cap (proteinMax 2.0 vs 2.5) is a refinement we can
  // layer in later by reading PROFILE_CHART_GOALS.proteinMax.
  yTopRaw: 2.5,
  yBottomRaw: 0,
  // goal is profile-keyed via PROFILE_CHART_GOALS.proteinGoal
  formatValue: fmtRaw,
  unit: "g/kg",
  isLongUnit: true,
  random: (rng) => randomFloat(rng, 0.6, 2.0, 1),
};

const LEAN_MASS: MetricChartConfig = {
  chartType: "bar",
  // 0..100 kg covers all four profile leanMassMax values; refine per-profile later.
  yTopRaw: 100,
  yBottomRaw: 0,
  // goal is profile-keyed via PROFILE_CHART_GOALS.leanMassGoal
  formatValue: fmtRaw,
  unit: "kg",
  random: (rng) => randomInt(rng, 30, 80),
};

// Availability is currently a tree (practice + game yes/no) reduced to a
// single 0/1 sentinel by readHealthMetric, so a 0..100% axis with a goal
// line at 80 is aspirational — the bar will appear as a 1-unit sliver
// against this scale. Content-team work to define a real availability
// percentage (e.g., participation rate over a week) is a follow-up.
const AVAILABILITY: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 100,
  yBottomRaw: 0,
  goalRaw: 80,
  formatValue: fmtPct,
  avgDecimals: 0,
  nullsCountAsZero: true,
  random: () => 100,
};

// Competition metrics — placeholder set (Wins/Losses/Goals/Assists/Yards/Tackles).
// All numeric, all sport-counter-shaped. Demo random values span the
// metric's full [yBottomRaw, yTopRaw] range so bars exercise the full
// chart height. The bottom is parameterized so a future metric with
// negative values (e.g., a score differential ranging -5..5) gets
// correct random data without code changes here.
function competitionConfig(
  yBottomRaw: number,
  yTopRaw: number,
): MetricChartConfig {
  return {
    chartType: "bar",
    yTopRaw,
    yBottomRaw,
    // No goalRaw — competition goals haven't been content-defined.
    formatValue: fmtRaw,
    random: (rng) => randomInt(rng, yBottomRaw, yTopRaw),
  };
}

const CONFIG: Record<string, MetricChartConfig> = {
  hydration: HYDRATION,
  sleepTime: SLEEP_TIME,
  sleepEfficiency: SLEEP_EFFICIENCY,
  protein: PROTEIN,
  leanMass: LEAN_MASS,
  availability: AVAILABILITY,
  goals: competitionConfig(0, 10),
  assists: competitionConfig(0, 10),
  yards: competitionConfig(0, 200),
  tackles: competitionConfig(0, 10),
  wins: competitionConfig(0, 5),
  losses: competitionConfig(0, 5),
};

const DEFAULT_CONFIG: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 100,
  yBottomRaw: 0,
  formatValue: fmtRaw,
  random: (rng) => randomInt(rng, 0, 100),
};

// Module-level overlay for user-defined custom metrics. The
// CustomMetricsProvider syncs this on every change via
// setCustomChartConfigs() below. getMetricChartConfig consults this
// after the built-in CONFIG and before falling back to DEFAULT_CONFIG.
//
// This is a deliberate side-effect channel rather than a parameter
// thread because getMetricChartConfig is called from many pure
// functions and components throughout the chart pipeline; threading
// the customs map through every call site is more invasive than the
// registry overlay justifies for the DGT-36 demo slice. To keep
// consumers reactive across overlay changes, components that read
// getMetricChartConfig in render should call useChartConfigSync(),
// which subscribes via useSyncExternalStore.
let _customConfigs: Record<string, MetricChartConfig> = {};
const _subscribers = new Set<() => void>();

export function setCustomChartConfigs(
  next: Record<string, MetricChartConfig>,
): void {
  if (next === _customConfigs) return;
  _customConfigs = next;
  for (const callback of _subscribers) callback();
}

function subscribeCustomChartConfigs(callback: () => void): () => void {
  _subscribers.add(callback);
  return () => {
    _subscribers.delete(callback);
  };
}

function getCustomChartConfigsSnapshot(): Record<string, MetricChartConfig> {
  return _customConfigs;
}

// Subscribe a component to overlay changes so subsequent
// getMetricChartConfig reads pick up newly-arrived custom-metric
// configs. Components that render charts (or otherwise read
// getMetricChartConfig in their render) should call this once. Returns
// the current snapshot reference so consumers can include it in
// useMemo dep arrays — when the overlay is replaced, the reference
// changes and dependent memoized values invalidate.
export function useChartConfigSync(): Record<string, MetricChartConfig> {
  return useSyncExternalStore(
    subscribeCustomChartConfigs,
    getCustomChartConfigsSnapshot,
    getCustomChartConfigsSnapshot,
  );
}

export function getMetricChartConfig(metricId: string): MetricChartConfig {
  return CONFIG[metricId] ?? _customConfigs[metricId] ?? DEFAULT_CONFIG;
}

// Build a MetricChartConfig from a user-authored CustomMetricDef.
// Inseparable percent suffix is folded into formatValue (matching the
// existing built-in pattern); other units render as the separable
// `unit` field. avgDecimals controls toFixed rounding. Random
// generators span the user's y-range for numeric metrics; radio
// metrics random in {0, 1} regardless of y-range.
// Default y-range used when a custom def's bounds are non-finite or
// inverted. The form rejects malformed inputs on write, but legacy /
// externally-written Firestore docs could still arrive with NaN or
// reversed bounds — falling back to a safe range keeps linearScale,
// SVG attributes, and randomFloat from producing NaN downstream.
const FALLBACK_Y_TOP = 10;
const FALLBACK_Y_BOTTOM = 0;

export function customDefToChartConfig(
  def: CustomMetricDef,
): MetricChartConfig {
  const isPct = def.unit === "%";
  // Clamp to [0, 100]: Number.prototype.toFixed throws RangeError
  // outside that range. The form already validates this on write, but
  // Firestore could surface legacy/externally-written values, so the
  // clamp is defense-in-depth.
  const decimals = Number.isFinite(def.avgDecimals)
    ? Math.min(100, Math.max(0, Math.floor(def.avgDecimals)))
    : 1;
  // Defense-in-depth: finite-check the axis bounds and goal. If
  // either bound is non-finite or the pair is inverted (yBottom >=
  // yTop), fall back to the safe default range. goalRaw drops to
  // undefined when non-finite — chartSeries.lookupGoalLine handles
  // undefined as "no goal line for this metric".
  let yTopRaw = Number.isFinite(def.yTopRaw) ? def.yTopRaw : FALLBACK_Y_TOP;
  let yBottomRaw = Number.isFinite(def.yBottomRaw)
    ? def.yBottomRaw
    : FALLBACK_Y_BOTTOM;
  if (yBottomRaw >= yTopRaw) {
    yTopRaw = FALLBACK_Y_TOP;
    yBottomRaw = FALLBACK_Y_BOTTOM;
  }
  const goalRaw = Number.isFinite(def.goalRaw) ? def.goalRaw : undefined;
  return {
    chartType: "bar",
    yTopRaw,
    yBottomRaw,
    goalRaw,
    formatValue: isPct
      ? (v) => `${v.toFixed(decimals)}%`
      : (v) => v.toFixed(decimals),
    unit: isPct ? undefined : def.unit || undefined,
    avgDecimals: decimals,
    // randomFloat (rounded to `decimals`) handles the form's
    // decimal-allowed y-axis bounds correctly. randomInt would
    // mis-bin non-integer ranges (e.g. min=0.2, max=0.8 could yield
    // 1.2). The radio branch keeps randomInt(0, 1) since values are
    // strictly 0/1.
    random:
      def.inputType === "radio"
        ? (rng) => randomInt(rng, 0, 1)
        : (rng) => randomFloat(rng, yBottomRaw, yTopRaw, decimals),
  };
}
