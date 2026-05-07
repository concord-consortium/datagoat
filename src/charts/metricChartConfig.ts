// Per-metric chart configuration. Single source of truth for chart type,
// axis range, axis inversion, value formatting, and (for metrics whose
// goal does not vary by profile) a static goal value.
//
// Metrics whose goal IS profile-keyed (sleepEfficiency, protein, leanMass)
// leave goalRaw undefined — chartSeries.lookupGoalLine resolves those
// against PROFILE_CHART_GOALS and falls back to this table for the rest.
//
// Content can revise these values freely; the chart engine reads only
// the resolved fields below and does not assume any metric is special.

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
  // E.g. v => `${v}%` for sleepEfficiency, v => `${v}` for hydration.
  formatValue: (raw: number) => string;
}

const fmtRaw = (v: number) => `${v}`;
const fmtPct = (v: number) => `${v}%`;

// Wellness metrics
const HYDRATION: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 1,
  yBottomRaw: 8,
  inverted: true,
  goalRaw: 3,
  formatValue: fmtRaw,
};

const SLEEP_TIME: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 10,
  yBottomRaw: 0,
  goalRaw: 8, // 7-9 hr typical recommendation; pick midpoint as static default
  formatValue: fmtRaw,
};

const SLEEP_EFFICIENCY: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 100,
  yBottomRaw: 0,
  // goal is profile-keyed via PROFILE_CHART_GOALS.sleepEffGoal
  formatValue: fmtPct,
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
};

const LEAN_MASS: MetricChartConfig = {
  chartType: "bar",
  // 0..100 kg covers all four profile leanMassMax values; refine per-profile later.
  yTopRaw: 100,
  yBottomRaw: 0,
  // goal is profile-keyed via PROFILE_CHART_GOALS.leanMassGoal
  formatValue: fmtRaw,
};

// Availability is currently a tree (practice + game yes/no) reduced to a
// single 0/1 sentinel by readWellnessMetric, so a 0..100% axis with a goal
// line at 80 is aspirational — the bar will appear as a 1-unit sliver
// against this scale. Content-team work to define a real availability
// percentage (e.g., participation rate over a week) is a follow-up.
const AVAILABILITY: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 100,
  yBottomRaw: 0,
  goalRaw: 80,
  formatValue: fmtPct,
};

// Performance metrics — placeholder set (Wins/Losses/Goals/Assists/Yards/Tackles).
// All numeric, all sport-counter-shaped. Generous yMax so demo data fits.
const PERFORMANCE_GENERIC: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 10,
  yBottomRaw: 0,
  // No goalRaw — performance goals haven't been content-defined.
  formatValue: fmtRaw,
};

const CONFIG: Record<string, MetricChartConfig> = {
  hydration: HYDRATION,
  sleepTime: SLEEP_TIME,
  sleepEfficiency: SLEEP_EFFICIENCY,
  protein: PROTEIN,
  leanMass: LEAN_MASS,
  availability: AVAILABILITY,
  goals: PERFORMANCE_GENERIC,
  assists: PERFORMANCE_GENERIC,
  yards: { ...PERFORMANCE_GENERIC, yTopRaw: 200 },
  tackles: PERFORMANCE_GENERIC,
  wins: { ...PERFORMANCE_GENERIC, yTopRaw: 5 },
  losses: { ...PERFORMANCE_GENERIC, yTopRaw: 5 },
};

const DEFAULT_CONFIG: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 100,
  yBottomRaw: 0,
  formatValue: fmtRaw,
};

export function getMetricChartConfig(metricId: string): MetricChartConfig {
  return CONFIG[metricId] ?? DEFAULT_CONFIG;
}
