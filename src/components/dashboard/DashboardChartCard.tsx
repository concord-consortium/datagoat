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
import css from "./DashboardChartCard.module.css";

interface DashboardChartCardProps {
  type: "wellness" | "performance";
  trackedMetricIds: string[];
  wellnessEntries?: WellnessEntry[];
  performanceEntries?: PerformanceEntry[];
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
}: DashboardChartCardProps) {
  const allMetrics: MetricDefinition[] =
    type === "wellness" ? WELLNESS_METRICS : PERFORMANCE_METRICS;
  const tracked = useMemo(
    () => allMetrics.filter((m) => trackedMetricIds.includes(m.id)),
    [allMetrics, trackedMetricIds],
  );

  const [selectedMetricId, setSelectedMetricId] = useState<string>(
    tracked[0]?.id ?? allMetrics[0]?.id ?? "",
  );
  const [range, setRange] = useState<TimeRangeKey>("1w");

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

  const description = metric
    ? `${metric.name} over the last ${range}.${
        average !== undefined
          ? ` Recent average: ${formatNumber(average)}${metric.unit ? ` ${metric.unit}` : ""}.`
          : ""
      }`
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
        data={series}
        averageLine={average}
        title={metric ? metric.name : "Metric"}
        description={description}
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
