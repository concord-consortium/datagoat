// Hook + helpers for selecting between real (Firestore-backed) and demo
// (random) chart data. Real data flows through buildAlignedSeries; demo
// data is generated locally when the user opens the app with `?demo`
// — used to assess chart visuals without populating real entries.
//
// A follow-up PR (DGT-30) will replace this minimal demo path with a
// richer demo system (scenario selection, per-day shapes, etc.). The
// `?demo` URL param and useDemoMode hook are the seams that DGT-30
// can extend without touching the chart engine.

import { useMemo } from "react";
import {
  buildAlignedSeries,
  type BuildSeriesArgs,
} from "./chartSeries";
import { getMetricChartConfig, useChartConfigSync } from "./metricChartConfig";
import { hashSeed, seededRng } from "./randomValues";
import { isoAtDaysAgo } from "../utils/dates";

const DEMO_NULL_RATE = 0.2;

// Random integer set once at module load. Mixed into the per-day seed so
// the demo data is stable within a session but varies between sessions
// (i.e., between page loads). Captured here rather than in a context
// because it should not change for the lifetime of the running app.
const SESSION_SEED = Math.floor(Math.random() * 0xffffffff);

// Pure function so consumers / tests can call it without React.
export function generateDemoSeries(
  metricId: string,
  rangeDays: number,
): Array<{ date: string; value: number | null }> {
  const config = getMetricChartConfig(metricId);
  const out: Array<{ date: string; value: number | null }> = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const date = isoAtDaysAgo(i);
    const rng = seededRng(hashSeed(`${SESSION_SEED}:${metricId}:${i}`));
    const value = rng() < DEMO_NULL_RATE ? null : config.random(rng);
    out.push({ date, value });
  }
  return out;
}

export interface UseChartSeriesArgs extends BuildSeriesArgs {
  demoMode: boolean;
}

export function useChartSeries(
  args: UseChartSeriesArgs,
): Array<{ date: string; value: number | null }> {
  const {
    type,
    metricId,
    healthEntries,
    competitionEntries,
    performanceEntries,
    rangeDays,
    demoMode,
  } = args;
  // Subscribe to overlay changes AND include the snapshot reference in
  // the memo dep array. In demo mode, generateDemoSeries reads the
  // metric's `random` generator from the overlay; without this dep,
  // the memoized series would stick with DEFAULT_CONFIG random when
  // the custom config arrives after first render.
  const overlayVersion = useChartConfigSync();
  return useMemo(() => {
    if (demoMode) {
      return generateDemoSeries(metricId, rangeDays);
    }
    return buildAlignedSeries({
      type,
      metricId,
      healthEntries,
      competitionEntries,
      performanceEntries,
      rangeDays,
    });
  }, [
    type,
    metricId,
    healthEntries,
    competitionEntries,
    performanceEntries,
    rangeDays,
    demoMode,
    overlayVersion,
  ]);
}
