import { useMemo, useState } from "react";
import CustomMetricIcon from "@/icons/custom-metric.svg?react";
import { MetricChart } from "../../charts/MetricChart";
import { SelectField } from "../form/SelectField";
import {
  TimeRangePicker,
  TIME_RANGE_DAYS,
  rangeDescriptionPhrase,
  type TimeRangeKey,
} from "./TimeRangePicker";
import type { DashboardChartSettings } from "../../types/profile";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { COMPETITION_METRICS } from "../../metrics/competitionMetrics";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import {
  ADDABLE_HEALTH,
  ADDABLE_PERFORMANCE,
  ADDABLE_COMPETITION,
} from "../../metrics/addableMetrics";
import type { MetricDefinition } from "../../metrics/types";
import type {
  CompetitionEntry,
  HealthEntry,
  PerformanceEntry,
} from "../../types/data";
import { useUser } from "../../contexts/UserContext";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import { DEFAULT_PROFILE_KEY } from "../../data/profileVariants";
import {
  capitalizeAthleteType,
  capitalizeGender,
  computeAverage,
  formatMetricValue,
  lookupGoalLine,
} from "../../charts/chartSeries";
import {
  getMetricChartConfig,
  useChartConfigSync,
} from "../../charts/metricChartConfig";
import { useChartSeries } from "../../charts/useChartSeries";
import { useDemoMode } from "../../contexts/DemoModeContext";
import css from "./DashboardChartCard.module.css";

// Narrow a persisted range string (stored loosely as `string` on the
// profile doc) back to a TimeRangeKey, ignoring stale/unknown values
// from an older build so the card falls back to the default.
function isTimeRangeKey(value: string | undefined): value is TimeRangeKey {
  // Own-property check, not `in`: `in` would accept inherited keys like
  // "toString"/"constructor", and TIME_RANGE_DAYS["toString"] is a
  // function, not a day count - which would break chart slicing.
  return value !== undefined && Object.hasOwn(TIME_RANGE_DAYS, value);
}

interface DashboardChartCardProps {
  type: "health" | "performance" | "competition";
  trackedMetricIds: string[];
  healthEntries?: HealthEntry[];
  competitionEntries?: CompetitionEntry[];
  performanceEntries?: PerformanceEntry[];
  // When true, the parent's DataContext is still loading. Render a
  // distinguishable skeleton variant of the placeholder per spec
  // "Empty data handling" - never flash zero-value axes during load.
  loading?: boolean;
}

// Wraps MetricChart placeholder + metric picker (SelectField) +
// TimeRangePicker. Reads the active metric from local state, slices the
// data array to the selected time range, and forwards through to the
// chart placeholder. The follow-up "real chart" PR swaps the placeholder
// without touching this wrapper.
export function DashboardChartCard({
  type,
  trackedMetricIds,
  healthEntries,
  competitionEntries,
  performanceEntries,
  loading = false,
}: DashboardChartCardProps) {
  useChartConfigSync();
  const allMetrics: MetricDefinition[] =
    type === "health"
      ? [...HEALTH_METRICS, ...ADDABLE_HEALTH]
      : type === "performance"
        ? [...PERFORMANCE_METRICS, ...ADDABLE_PERFORMANCE]
        : [...COMPETITION_METRICS, ...ADDABLE_COMPETITION];
  const { loadState, updateProfile } = useUser();
  const { metrics: allCustom } = useCustomMetrics();
  const profile = loadState.status === "loaded" ? loadState.profile : null;
  const profileKey = profile
    ? `${capitalizeGender(profile.gender)}/${capitalizeAthleteType(profile.athleteType)}`
    : DEFAULT_PROFILE_KEY;
  // Both built-ins and customs respect the user's tracked-IDs
  // preference, including ordering: the user can drag-reorder a
  // custom among built-ins on /setup/tracking, and the picker
  // dropdown should reflect that order. Iterate trackedMetricIds and
  // dispatch to whichever map (built-in or custom) carries the id.
  const tracked = useMemo<
    Array<{ id: string; name: string; Icon?: MetricDefinition["Icon"] }>
  >(() => {
    const builtInById = new Map(allMetrics.map((m) => [m.id, m]));
    const customById = new Map<string, (typeof allCustom)[number]>();
    for (const def of allCustom) {
      if (def.metricType === type) customById.set(def.id, def);
    }
    const out: Array<{
      id: string;
      name: string;
      Icon?: MetricDefinition["Icon"];
    }> = [];
    for (const id of trackedMetricIds) {
      const builtIn = builtInById.get(id);
      if (builtIn) {
        out.push(builtIn);
        continue;
      }
      const custom = customById.get(id);
      if (custom) out.push(custom);
      // Stale id that resolves to neither — silently skip.
    }
    return out;
  }, [allMetrics, allCustom, type, trackedMetricIds]);

  // Seed both picks from the persisted profile doc (DGT-64) so they
  // survive reload. ProtectedRoute guarantees the profile is loaded
  // before the dashboard mounts, so this initializer reliably sees the
  // saved values on first render. A stale persisted metric id (no
  // longer tracked) falls through to `tracked[0]` at the `metric`
  // lookup below; an unknown range string falls back to "7d".
  const savedChart = profile?.dashboardCharts?.[type];
  const [selectedMetricId, setSelectedMetricId] = useState<string>(
    savedChart?.metric ?? tracked[0]?.id ?? "",
  );
  const [range, setRange] = useState<TimeRangeKey>(
    isTimeRangeKey(savedChart?.range) ? savedChart.range : "7d",
  );
  const demoMode = useDemoMode();

  // Persist this card's pick to the profile doc. Fire-and-forget,
  // matching the metric-toggle writes on /setup/tracking: the pick is
  // already applied locally via setState, so a failed write only costs
  // persistence across reloads, not the current interaction. The spread
  // preserves the other sections' picks and this section's other field.
  const persistChart = (patch: DashboardChartSettings) => {
    void updateProfile({
      dashboardCharts: {
        ...profile?.dashboardCharts,
        [type]: { ...savedChart, ...patch },
      },
    });
  };

  // metric is undefined when no metrics are tracked — handled by the
  // empty-state return below. Don't fall back to allMetrics[0]; that
  // would produce a chart for an untracked metric while the picker
  // stays empty.
  const metric = tracked.find((m) => m.id === selectedMetricId) ?? tracked[0];

  const series = useChartSeries({
    type,
    metricId: metric?.id ?? "",
    healthEntries: healthEntries ?? [],
    competitionEntries: competitionEntries ?? [],
    performanceEntries: performanceEntries ?? [],
    rangeDays: TIME_RANGE_DAYS[range],
    demoMode,
  });

  if (!metric) {
    return (
      <div className={css.chartCard}>
        <p className={css.emptyState}>
          {type === "health"
            ? "No tracked health metrics."
            : type === "performance"
              ? "No tracked performance metrics."
              : "No tracked competition metrics."}
        </p>
      </div>
    );
  }

  const config = getMetricChartConfig(metric.id);
  const average = computeAverage(series, {
    nullsCountAsZero: config.nullsCountAsZero,
  });
  const goalLine = lookupGoalLine(metric.id, profileKey);

  // Compose the chart description for SR users — includes goal and
  // average context that the visual chart conveys.
  const description = loading
    ? `${metric.name} chart is loading.`
    : [
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

  // Addable built-ins and user custom metrics ship without a
  // designer-final glyph; fall back to the generic custom-metric icon
  // so every picker row (and the closed-state trigger) stays aligned.
  const selectOptions = tracked.map((m) => ({
    value: m.id,
    label: m.name,
    Icon: m.Icon ?? CustomMetricIcon,
  }));

  return (
    <div className={css.chartCard}>
      <div className={css.chartCardControls}>
        <div className={css.metricSelectWrap}>
          <SelectField
            label={
              type === "health"
                ? "Health metric"
                : type === "performance"
                  ? "Performance metric"
                  : "Competition metric"
            }
            labelVisuallyHidden
            options={selectOptions}
            value={metric.id}
            onChange={(e) => {
              setSelectedMetricId(e.target.value);
              persistChart({ metric: e.target.value });
            }}
          />
        </div>
      </div>
      <MetricChart
        type={config.chartType}
        metricId={metric.id}
        data={loading ? [] : series}
        goalLine={goalLine}
        averageLine={average}
        title={metric.name}
        description={description}
        rangeKey={range}
        loading={loading}
      />
      <TimeRangePicker
        value={range}
        onChange={(next) => {
          setRange(next);
          persistChart({ range: next });
        }}
        ariaLabel={`${metric.name} time range`}
      />
    </div>
  );
}

