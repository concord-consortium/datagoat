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
import { DEFAULT_PROFILE_KEY } from "../../data/profileVariants";
import {
  buildSeries,
  capitalizeAthleteType,
  capitalizeGender,
  formatNumber,
  lookupGoalLine,
} from "../../charts/chartSeries";
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
          `${metric.name} ${rangeDescriptionPhrase(range)}.`,
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
            value={metric?.id ?? ""}
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

