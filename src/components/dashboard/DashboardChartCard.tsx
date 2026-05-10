import { useMemo, useState } from "react";
import { MetricChart } from "../../charts/MetricChart";
import { SelectField } from "../form/SelectField";
import {
  TimeRangePicker,
  TIME_RANGE_DAYS,
  rangeDescriptionPhrase,
  type TimeRangeKey,
} from "./TimeRangePicker";
import { WELLNESS_METRICS } from "../../metrics/wellnessMetrics";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import type { MetricDefinition } from "../../metrics/types";
import type { PerformanceEntry, WellnessEntry } from "../../types/data";
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
  useChartConfigSync();
  const allMetrics: MetricDefinition[] =
    type === "wellness" ? WELLNESS_METRICS : PERFORMANCE_METRICS;
  const { loadState } = useUser();
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
  const tracked = useMemo<Array<{ id: string; name: string }>>(() => {
    const builtInById = new Map(allMetrics.map((m) => [m.id, m]));
    const customById = new Map<string, (typeof allCustom)[number]>();
    for (const def of allCustom) {
      if (def.metricType === type) customById.set(def.id, def);
    }
    const out: Array<{ id: string; name: string }> = [];
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

  const [selectedMetricId, setSelectedMetricId] = useState<string>(
    tracked[0]?.id ?? "",
  );
  const [range, setRange] = useState<TimeRangeKey>("7d");
  const demoMode = useDemoMode();

  // metric is undefined when no metrics are tracked — handled by the
  // empty-state return below. Don't fall back to allMetrics[0]; that
  // would produce a chart for an untracked metric while the picker
  // stays empty.
  const metric = tracked.find((m) => m.id === selectedMetricId) ?? tracked[0];

  const series = useChartSeries({
    type,
    metricId: metric?.id ?? "",
    wellnessEntries: wellnessEntries ?? [],
    performanceEntries: performanceEntries ?? [],
    rangeDays: TIME_RANGE_DAYS[range],
    demoMode,
  });

  if (!metric) {
    return (
      <div className={css.chartCard}>
        <p className={css.emptyState}>
          {type === "wellness"
            ? "No tracked health & wellness metrics."
            : "No tracked performance metrics."}
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
            labelVisuallyHidden
            options={selectOptions}
            value={metric.id}
            onChange={(e) => setSelectedMetricId(e.target.value)}
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
        onChange={setRange}
        ariaLabel={`${metric.name} time range`}
      />
    </div>
  );
}

