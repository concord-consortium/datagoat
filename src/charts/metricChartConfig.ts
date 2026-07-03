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
import { formatDecimalToTime, resolveTimeLayout, type TimeLayout } from "../utils/timeValue";
import type { CustomMetricDef, CustomMetricLevel } from "../types/customMetrics";

export interface MetricChartConfig {
  chartType: "bar" | "line";
  yTopRaw: number;
  yBottomRaw: number;
  // When true, the "top of plot" corresponds to yTopRaw being numerically
  // smaller than yBottomRaw (Hydration's 1..8 urine-color scale: 1 = best,
  // displayed at the top). Default false: yBottomRaw < yTopRaw, top = max.
  inverted?: boolean;
  // When true, a value at or below goalRaw "meets" the goal (lower is
  // better — race times, etc.). Default false: at or above goalRaw meets
  // it. Distinct from `inverted`, which only controls axis orientation:
  // a metric can be lower-is-better with an ascending axis (a race time
  // charted 4..15 with the goal line sitting low), so the two are
  // separate flags rather than one overloaded one.
  lowerIsBetter?: boolean;
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
  // When set, this metric renders as a time. formatValue returns a
  // formatted time string (e.g. "5:30") and `unit` is left undefined so
  // consumers append no suffix. avgDecimals doubles as the seconds
  // decimal places.
  timeLayout?: TimeLayout;
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

// Partial chart-config override for a built-in metric. Only the three
// user-editable fields; everything else (formatValue, inverted,
// random, unit, ...) is inherited from the metric's base config.
export type MetricOverrideFields = Partial<
  Pick<MetricChartConfig, "goalRaw" | "yTopRaw" | "yBottomRaw">
>;

const fmtRaw = (v: number) => `${v}`;
const fmtPct = (v: number) => `${v}%`;

function timeFormatValue(layout: TimeLayout, secondsDecimals: number) {
  return (v: number) => formatDecimalToTime(v, layout, secondsDecimals);
}

// Health metrics
const HYDRATION: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 1,
  yBottomRaw: 8,
  inverted: true,
  lowerIsBetter: true,
  goalRaw: 3,
  formatValue: fmtRaw,
  random: (rng) => randomInt(rng, 1, 5),
};

const SLEEP_TIME_LAYOUT: TimeLayout = { coarsest: "h", precision: "m" };
const SLEEP_TIME: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 10,
  yBottomRaw: 0,
  goalRaw: 8, // 7-9 hr typical recommendation; pick midpoint as static default
  timeLayout: SLEEP_TIME_LAYOUT,
  formatValue: timeFormatValue(SLEEP_TIME_LAYOUT, 0), // whole minutes; no seconds component
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

const MOOD: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 5,
  yBottomRaw: 1,
  goalRaw: 4,
  formatValue: fmtRaw,
  random: (rng) => randomInt(rng, 1, 5),
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
  unit?: string,
  timePrecision?: "h" | "m" | "s",
): MetricChartConfig {
  const layout = timePrecision ? resolveTimeLayout({ unit, timePrecision }) : null;
  return {
    chartType: "bar",
    yTopRaw,
    yBottomRaw,
    // No goalRaw — competition goals haven't been content-defined.
    formatValue: layout ? timeFormatValue(layout, 0) : fmtRaw,
    unit: layout ? undefined : unit,
    timeLayout: layout ?? undefined,
    random: (rng) => randomInt(rng, yBottomRaw, yTopRaw),
  };
}

// Winning Percentage. Per-entry values are 0 (loss) or 1 (win); the
// chart renders the per-game pattern (binary axis) rather than a
// derived percentage line. Aggregating to a running percentage in
// the chart is a follow-up — the Competition Log Total column already
// shows the overall percentage.
const WINNING_PERCENTAGE: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 1,
  yBottomRaw: 0,
  formatValue: (v) => (v === 1 ? "W" : v === 0 ? "L" : `${v}`),
  random: (rng) => (rng() < 0.5 ? 0 : 1),
};

// Performance metrics — per-metric chart bounds for the 19 built-ins
// in ADDABLE_PERFORMANCE. yBottom/yTop carry one of two provenances:
//
//   "from sheet" — bounds derived from the DGT-51 spreadsheet's
//     "Estimated Range (Physiological)" column. Six metrics qualify.
//   "guesstimate" — no sheet value; bounds picked during DGT-61 and
//     flagged for content-team review. Thirteen metrics qualify.
//
// All authored ascending (yBottom < yTop) regardless of "lower is
// better" semantics. Time-based metrics (mile run, sprints) keep the
// goal line low on the chart — bars get shorter as the athlete
// improves, matching an athlete's mental model. The override form's
// existing baseAscending check ends up "always ascending" for perf.
//
// Time-based metrics also pass lowerIsBetter so bar coloring treats a
// faster (smaller) time as meeting the goal. That is independent of
// axis orientation — the axis stays ascending; only the goal-polarity
// flips.
//
// Unit choice for ambiguous-unit metrics (kg/lbs, m/s/mph, m/mi,
// in/cm): we pick one canonical unit per metric. Stored entry values
// remain unit-agnostic raw numbers; the unit string here affects only
// chart tooltips and axis labels.
function performanceConfig(
  yBottomRaw: number,
  yTopRaw: number,
  unit?: string,
  lowerIsBetter?: boolean,
  timePrecision?: "h" | "m" | "s",
): MetricChartConfig {
  const layout = timePrecision ? resolveTimeLayout({ unit, timePrecision }) : null;
  return {
    chartType: "bar",
    yTopRaw,
    yBottomRaw,
    lowerIsBetter,
    // No goalRaw — perf goals are user-set per the DGT-51 sheet.
    formatValue: layout ? timeFormatValue(layout, 0) : fmtRaw,
    unit: layout ? undefined : unit,
    timeLayout: layout ?? undefined,
    // randomFloat (rather than randomInt) — perf ranges include
    // non-integer bounds (e.g. fortyYardDash 4.2..10). Rounded to 1
    // decimal so demo values match the chart's typical avgDecimals.
    random: (rng) => randomFloat(rng, yBottomRaw, yTopRaw, 1),
  };
}

const CONFIG: Record<string, MetricChartConfig> = {
  hydration: HYDRATION,
  sleepTime: SLEEP_TIME,
  sleepEfficiency: SLEEP_EFFICIENCY,
  protein: PROTEIN,
  leanMass: LEAN_MASS,
  availability: AVAILABILITY,
  mood: MOOD,
  winningPercentage: WINNING_PERCENTAGE,
  goals: competitionConfig(0, 10),
  assists: competitionConfig(0, 10),
  yards: competitionConfig(0, 200),
  tackles: competitionConfig(0, 10),
  scores: competitionConfig(0, 100),
  times: competitionConfig(0, 60, "min", "s"),
  // Performance — from sheet (time metrics pass lowerIsBetter)
  oneMileRun: performanceConfig(4, 15, "min", true, "s"),         // from sheet
  tenMeterSprint: performanceConfig(1, 3, "sec", true, "s"),      // from sheet
  fortyYardDash: performanceConfig(4.2, 10, "sec", true, "s"),    // from sheet
  beepTest: performanceConfig(1, 21, "levels"),              // from sheet
  standingBroadJump: performanceConfig(100, 350, "cm"),      // from sheet
  verticalJump: performanceConfig(1, 50, "in"),              // from sheet
  // Performance — guesstimate (content team to confirm)
  oneRepMaxBench: performanceConfig(0, 250, "kg"),           // guesstimate
  oneRepMaxDeadlift: performanceConfig(0, 300, "kg"),        // guesstimate
  oneRepMaxHangClean: performanceConfig(0, 200, "kg"),       // guesstimate
  oneRepMaxPowerClean: performanceConfig(0, 200, "kg"),      // guesstimate
  oneRepMaxSquat: performanceConfig(0, 300, "kg"),           // guesstimate
  averageVelocity: performanceConfig(0, 15, "m/s"),          // guesstimate
  deceleration: performanceConfig(0, 15, "m/s"),             // guesstimate
  distance: performanceConfig(0, 20, "mi"),                  // guesstimate
  forwardAcceleration: performanceConfig(0, 15, "m/s"),      // guesstimate
  heartRateZone: performanceConfig(50, 200, "bpm"),          // guesstimate
  peakVelocity: performanceConfig(0, 15, "m/s"),             // guesstimate
  reactiveStrengthIndex: performanceConfig(0, 5),            // guesstimate
  upwardAcceleration: performanceConfig(0, 15, "m/s"),       // guesstimate
};

const DEFAULT_CONFIG: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 100,
  yBottomRaw: 0,
  formatValue: fmtRaw,
  random: (rng) => randomInt(rng, 0, 100),
};

// Module-level overlays for chart-config augmentation. Two registries
// share a single subscriber set and version counter:
//   _customConfigs    — full config replacements for user-defined
//     custom metrics (set by CustomMetricsProvider via
//     setCustomChartConfigs).
//   _metricOverrides  — partial goal/axis overrides for built-in
//     metrics (set by MetricOverridesProvider via setMetricOverrides).
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
// Partial overrides keyed by metric id. Distinct from _customConfigs:
// a custom-metric entry fully replaces the resolved config, whereas an
// override entry shallow-merges on top of the metric's base config so
// the built-in formatValue / inverted / random survive.
let _metricOverrides: Record<string, MetricOverrideFields> = {};
// Monotonic counter bumped whenever either overlay registry changes.
// useChartConfigSync exposes it so a change to *either* registry
// invalidates dependent memos (e.g. useChartSeries). Consumers treat
// it as an opaque dependency token and never read it.
let _overlayVersion = 0;
const _subscribers = new Set<() => void>();

function notifyOverlay(): void {
  _overlayVersion += 1;
  for (const callback of _subscribers) callback();
}

export function setCustomChartConfigs(
  next: Record<string, MetricChartConfig>,
): void {
  if (next === _customConfigs) return;
  _customConfigs = next;
  notifyOverlay();
}

export function setMetricOverrides(
  next: Record<string, MetricOverrideFields>,
): void {
  if (next === _metricOverrides) return;
  _metricOverrides = next;
  notifyOverlay();
}

function subscribeOverlay(callback: () => void): () => void {
  _subscribers.add(callback);
  return () => {
    _subscribers.delete(callback);
  };
}

function getOverlaySnapshot(): number {
  return _overlayVersion;
}

// Subscribe a component to overlay changes (custom-metric configs OR
// metric overrides) so subsequent getMetricChartConfig reads pick up
// new values. Components that render charts should call this once.
// Returns a version counter that changes on every overlay mutation —
// include it in useMemo dep arrays to invalidate on change.
export function useChartConfigSync(): number {
  return useSyncExternalStore(
    subscribeOverlay,
    getOverlaySnapshot,
    getOverlaySnapshot,
  );
}

// The metric's config without any user override applied: the built-in
// CONFIG entry, a custom-metric config, or DEFAULT_CONFIG.
export function getBaseMetricChartConfig(metricId: string): MetricChartConfig {
  return CONFIG[metricId] ?? _customConfigs[metricId] ?? DEFAULT_CONFIG;
}

// The partial override registered for a metric, if any.
export function getMetricOverride(
  metricId: string,
): MetricOverrideFields | undefined {
  return _metricOverrides[metricId];
}

export function getMetricChartConfig(metricId: string): MetricChartConfig {
  const base = getBaseMetricChartConfig(metricId);
  const override = _metricOverrides[metricId];
  return override ? { ...base, ...override } : base;
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
    ? Math.min(100, Math.max(0, Math.floor(def.avgDecimals ?? 1)))
    : 1;
  const timeLayout = resolveTimeLayout({ unit: def.unit, timePrecision: def.timePrecision });
  // Defense-in-depth: finite-check the axis bounds and goal. If
  // either bound is non-finite or the pair is inverted (yBottom >=
  // yTop), fall back to the safe default range. goalRaw drops to
  // undefined when non-finite — chartSeries.lookupGoalLine handles
  // undefined as "no goal line for this metric".
  let yTopRaw = Number.isFinite(def.yTopRaw) ? (def.yTopRaw ?? FALLBACK_Y_TOP) : FALLBACK_Y_TOP;
  let yBottomRaw = Number.isFinite(def.yBottomRaw)
    ? (def.yBottomRaw ?? FALLBACK_Y_BOTTOM)
    : FALLBACK_Y_BOTTOM;
  if (yBottomRaw >= yTopRaw) {
    yTopRaw = FALLBACK_Y_TOP;
    yBottomRaw = FALLBACK_Y_BOTTOM;
  }
  const goalRaw = Number.isFinite(def.goalRaw) ? (def.goalRaw ?? undefined) : undefined;
  // Round to `decimals` places via toFixed, then round-trip through
  // Number so trailing zeros drop. Cleaner everywhere it's displayed:
  // y-axis labels for an integer bound (Y/N's 1 / 0) render as "1" / "0"
  // instead of "1.0" / "0.0", while non-integer averages still show
  // their decimals ("0.7", "0.583" → "0.6").
  const formatNumber = (v: number): string =>
    String(Number(v.toFixed(decimals)));
  return {
    chartType: "bar",
    yTopRaw,
    yBottomRaw,
    goalRaw,
    formatValue: timeLayout
      ? (v) => formatDecimalToTime(v, timeLayout, decimals)
      : isPct
        ? (v) => `${formatNumber(v)}%`
        : formatNumber,
    unit: timeLayout ? undefined : isPct ? undefined : def.unit || undefined,
    timeLayout: timeLayout ?? undefined,
    avgDecimals: decimals,
    // Numeric customs: randomFloat (rounded to `decimals`) handles the
    // form's decimal-allowed y-axis bounds correctly. randomInt would
    // mis-bin non-integer ranges (e.g. min=0.2, max=0.8 could yield
    // 1.2). Ordinal customs (incl. the Y/N preset): sample uniformly
    // from the defined level values so demo data always lands on a
    // real category - Y/N picks from {0, 1} naturally, a Likert 1..5
    // picks from {1,2,3,4,5}.
    random:
      def.primitive === "numeric"
        ? (rng) => randomFloat(rng, yBottomRaw, yTopRaw, decimals)
        : (rng) => randomLevelValue(rng, def.levels ?? []),
  };
}

function randomLevelValue(
  rng: () => number,
  levels: CustomMetricLevel[],
): number {
  const numeric = levels
    .map((l) => l.value)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (numeric.length === 0) {
    // Defensive: an ordinal custom should always have finite values
    // (form rejects otherwise), but a malformed doc shouldn't crash
    // demo rendering. Fall back to the legacy 0/1 sample.
    return randomInt(rng, 0, 1);
  }
  const idx = Math.min(numeric.length - 1, Math.floor(rng() * numeric.length));
  return numeric[idx];
}
