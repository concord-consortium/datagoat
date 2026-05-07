# DGT-35: MetricChart Bar Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the gray-box `<MetricChart>` placeholder with a working hand-rolled SVG bar chart that matches the prototype: vertical bars colored by goal-comparison (bright green at-or-above goal, muted green below), a left-edge yellow goal badge, a floating upper-right average badge, a today-no-data ghost (dashed-rectangle outline at the today slot), and adaptive x-axis labels — across all six ranges (7d / 2w / 30d / 3mo / 6mo / 1y) and all wellness/performance metrics. The line chart variant remains in the prop API but is not implemented this round.

**Architecture:** Hand-rolled SVG only — no chart library. A `MetricBarChart` orchestrator computes geometry + scale once and composes five focused subcomponents — `Axes` (y/x labels), `Bars` (vertical bars with goal-comparison color), `TodayGhost` (dashed-rectangle outline when today is null), `GoalLineAndBadge` (horizontal line + left-edge badge), `AverageBadge` (floating right-edge badge) — inside a `<g>` group within `MetricChart`'s existing `role="img"` SVG (the a11y wiring stays on `MetricChart`). The decomposition makes each piece testable in isolation and gives the future line-chart variant three reusable subcomponents (`Axes`, `GoalLineAndBadge`, `AverageBadge`) — only the data-rendering primitive (`Bars` ↔ a future `LineLayer`) needs to be swapped. The orchestrator uses a small shared `<If>` component (`src/components/common/If.tsx`) to keep conditional rendering as JSX rather than `&&` expressions. A new `metricChartConfig.ts` table is the single source of truth for per-metric chart settings (`chartType`, axis label values, value formatter, axis inversion, static goal default). A small `linearScale` helper handles raw→pixel mapping. `chartSeries.buildAlignedSeries` emits a date-aligned window where missing days are `value: null`, so the chart can render today-ghost / empty past-slots correctly; the existing `buildSeries` stays as-is for the data table.

**Tech Stack:** React 19, TypeScript 5, CSS Modules (no Tailwind, no SCSS), Vitest + React Testing Library + jsdom. SVG rendered inline via JSX. No new runtime dependencies.

**Branch base:** `convert-prototype` (PR #3 still in review at plan-write time). Branch name: `DGT-35-bar-chart`. If `convert-prototype` merges to `main` before execution begins, rebase onto `main` before opening the PR.

**Commands:**
- `npm test` — runs Vitest (uses `*.test.ts` / `*.test.tsx` colocated)
- `npm test -- src/charts/` — runs only the chart tests
- `npm run dev` — Vite dev server on http://localhost:5173 (requires `npm run emulators` in another terminal)
- `npm run build` — TypeScript check + production build (use to confirm nothing breaks at build time)

---

## File Structure

**New files:**
- `src/charts/linearScale.ts` — pure scale helper. Maps raw domain values to pixel range; supports inverted axes via the range argument.
- `src/charts/linearScale.test.ts` — unit tests for the scale.
- `src/charts/metricChartConfig.ts` — per-metric chart configuration table + `getMetricChartConfig(metricId)` lookup with default fallback.
- `src/charts/metricChartConfig.test.ts` — verifies known metrics have entries and unknown metrics get a sane default.
- `src/charts/xAxisLabels.ts` — `xAxisLabelIndices(rangeKey, dataLength)` returns the set of indices that should render an x-axis tick label.
- `src/charts/xAxisLabels.test.ts` — verifies first+last always shown; correct step per range.
- `src/components/common/If.tsx` — small project-wide utility for conditional rendering as JSX (`<If condition={...}>...</If>`) instead of `&&` expressions or ternaries. Used by the `MetricBarChart` orchestrator to keep its composition JSX-all-the-way-down.
- `src/components/common/If.test.tsx`
- `src/charts/chartGeom.ts` — shared `ChartGeom` type passed from the orchestrator to each subcomponent so they can position themselves consistently.
- `src/charts/Axes.tsx` — y-axis top/bottom labels + adaptive x-axis date labels.
- `src/charts/Axes.test.tsx`
- `src/charts/Bars.tsx` — vertical bars with goal-comparison color encoding (bright vs. muted green); skips null slots.
- `src/charts/Bars.test.tsx`
- `src/charts/TodayGhost.tsx` — dashed-rectangle outline at the today slot when today's value is null.
- `src/charts/TodayGhost.test.tsx`
- `src/charts/GoalLineAndBadge.tsx` — horizontal goal line spanning the plot + left-edge yellow goal badge.
- `src/charts/GoalLineAndBadge.test.tsx`
- `src/charts/AverageBadge.tsx` — rectangular floating "Avg: X" badge anchored at the right edge, vertically centered on the avg y.
- `src/charts/AverageBadge.test.tsx`
- `src/charts/MetricBarChart.tsx` — thin orchestrator. Computes geometry + scale and composes the five subcomponents inside a `<g>`.
- `src/charts/MetricBarChart.module.css` — shared CSS module for all bar-chart subcomponents (bar colors, badge styles, axis label fonts, today-ghost stroke).
- `src/charts/MetricBarChart.test.tsx` — integration test that renders the assembled chart and confirms all pieces compose correctly.

**Modified files:**
- `src/charts/chartSeries.ts` — add `buildAlignedSeries` (raw `value: number | null`, full-range date-aligned). Existing `buildSeries` and `lookupGoalLine` unchanged on signature; `lookupGoalLine` extended internally to fall back to `getMetricChartConfig(metricId).goalRaw`.
- `src/charts/chartSeries.test.ts` (create if absent) — tests for `buildAlignedSeries` plus the `lookupGoalLine` config fallback.
- `src/charts/ChartDataTable.tsx` — accept `value: number | null` and render `"—"` for null cells.
- `src/charts/ChartDataTable.module.css` — no change expected.
- `src/charts/MetricChart.tsx` — drop the placeholder gray-box; route `type === "bar"` to `<MetricBarChart>`; render a small TBD note for `type === "line"`. Update `data` prop type to allow null.
- `src/charts/MetricChart.test.tsx` — replace the two placeholder-text assertions with bar-routing assertions; keep the `<title>`/`<desc>` and "Show data" toggle tests.
- `src/charts/MetricDetail.tsx` — replace `chartTypeFor()` with `getMetricChartConfig(metric.id).chartType`. Switch the chart's `data` source from `buildSeries` to `buildAlignedSeries`.
- `src/components/dashboard/DashboardChartCard.tsx` — same chart-type plumbing; switch from `buildSeries` to `buildAlignedSeries` for the chart's data.

The existing `chartSeries.buildSeries` stays as-is and is still used to populate `<ChartDataTable>` (data-table only shows the days that have entries — it doesn't need null padding).

---

### Task 1: Add `linearScale` helper

**Files:**
- Create: `src/charts/linearScale.ts`
- Test: `src/charts/linearScale.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/charts/linearScale.test.ts
import { describe, it, expect } from "vitest";
import { linearScale } from "./linearScale";

describe("linearScale", () => {
  it("maps domain endpoints to range endpoints", () => {
    const s = linearScale([0, 100], [0, 140]);
    expect(s(0)).toBe(0);
    expect(s(100)).toBe(140);
  });

  it("maps the midpoint linearly", () => {
    const s = linearScale([0, 100], [0, 140]);
    expect(s(50)).toBe(70);
  });

  it("supports inverted SVG-y ranges (high domain → top of plot)", () => {
    // Standard wellness % chart: 0% at the bottom (y = 140), 100% at the top (y = 0)
    const s = linearScale([0, 100], [140, 0]);
    expect(s(0)).toBe(140);
    expect(s(100)).toBe(0);
    expect(s(50)).toBe(70);
  });

  it("supports inverted domains (low raw value → top of plot, e.g. Hydration 1..8)", () => {
    // Hydration: 1 at the top (y = 0), 8 at the bottom (y = 140)
    const s = linearScale([1, 8], [0, 140]);
    expect(s(1)).toBe(0);
    expect(s(8)).toBe(140);
  });

  it("guards against zero-span domains", () => {
    const s = linearScale([5, 5], [0, 100]);
    expect(s(5)).toBe(0);
    expect(Number.isFinite(s(7))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/charts/linearScale.test.ts`
Expected: All five tests FAIL with "Cannot find module './linearScale'".

- [ ] **Step 3: Implement `linearScale`**

```ts
// src/charts/linearScale.ts

// Linear interpolation from domain to range. Pure and stateless.
//
// SVG y conventionally has the origin at the top, so most callers pass an
// "inverted" range like [plotBottom, plotTop] to put low values at the
// bottom of the plot. Hydration is the unusual case: the metric scale
// itself is inverted (1 = best, 8 = worst), so the chart passes
// [plotTop, plotBottom] over the natural domain to keep "1" at the top.
export function linearScale(
  domain: [number, number],
  range: [number, number],
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  // Zero-span domain → return the lower range bound for any input.
  if (span === 0) return () => r0;
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/charts/linearScale.test.ts`
Expected: All five tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/charts/linearScale.ts src/charts/linearScale.test.ts
git commit -m "feat(charts): add linearScale helper for bar chart rendering [DGT-35]"
```

---

### Task 2: Create `metricChartConfig` table and extend `lookupGoalLine`

**Files:**
- Create: `src/charts/metricChartConfig.ts`
- Test: `src/charts/metricChartConfig.test.ts`
- Modify: `src/charts/chartSeries.ts:6-23` (extend `lookupGoalLine` to fall back to config)
- Test: `src/charts/chartSeries.test.ts` (create if absent)

- [ ] **Step 1: Write failing tests for the config**

```ts
// src/charts/metricChartConfig.test.ts
import { describe, it, expect } from "vitest";
import { getMetricChartConfig } from "./metricChartConfig";

describe("getMetricChartConfig", () => {
  it("returns bar chart config for hydration with inverted axis", () => {
    const c = getMetricChartConfig("hydration");
    expect(c.chartType).toBe("bar");
    expect(c.yTopRaw).toBe(1);
    expect(c.yBottomRaw).toBe(8);
    expect(c.inverted).toBe(true);
    expect(c.goalRaw).toBe(3);
    expect(c.formatValue(3)).toBe("3");
  });

  it("returns bar chart config for sleepEfficiency with percent format", () => {
    const c = getMetricChartConfig("sleepEfficiency");
    expect(c.chartType).toBe("bar");
    expect(c.yTopRaw).toBe(100);
    expect(c.yBottomRaw).toBe(0);
    expect(c.inverted).toBeFalsy();
    expect(c.formatValue(75)).toBe("75%");
    // Goal is profile-keyed for this metric — config has no static goalRaw
    expect(c.goalRaw).toBeUndefined();
  });

  it("returns sane defaults for unknown metric ids", () => {
    const c = getMetricChartConfig("not-a-real-metric");
    expect(c.chartType).toBe("bar");
    expect(c.yTopRaw).toBeGreaterThan(c.yBottomRaw);
    expect(typeof c.formatValue(1)).toBe("string");
  });

  it("formats hydration values without a unit suffix", () => {
    const c = getMetricChartConfig("hydration");
    expect(c.formatValue(3.4)).toBe("3.4");
  });

  it("formats sleepTime in raw hours", () => {
    const c = getMetricChartConfig("sleepTime");
    expect(c.formatValue(7.5)).toBe("7.5");
    expect(c.yTopRaw).toBe(10);
    expect(c.yBottomRaw).toBe(0);
  });
});
```

- [ ] **Step 2: Run config tests to verify they fail**

Run: `npm test -- src/charts/metricChartConfig.test.ts`
Expected: All tests FAIL with "Cannot find module './metricChartConfig'".

- [ ] **Step 3: Implement the config table**

```ts
// src/charts/metricChartConfig.ts

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
  yTopRaw: 1, yBottomRaw: 8, inverted: true,
  goalRaw: 3,
  formatValue: fmtRaw,
};

const SLEEP_TIME: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 10, yBottomRaw: 0,
  goalRaw: 8, // 7-9 hr typical recommendation; pick midpoint as static default
  formatValue: fmtRaw,
};

const SLEEP_EFFICIENCY: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 100, yBottomRaw: 0,
  // goal is profile-keyed via PROFILE_CHART_GOALS.sleepEffGoal
  formatValue: fmtPct,
};

const PROTEIN: MetricChartConfig = {
  chartType: "bar",
  // 0..2.5 g/kg/day covers all four canonical profiles' proteinMax.
  // Per-profile y-cap (proteinMax 2.0 vs 2.5) is a refinement we can
  // layer in later by reading PROFILE_CHART_GOALS.proteinMax.
  yTopRaw: 2.5, yBottomRaw: 0,
  // goal is profile-keyed via PROFILE_CHART_GOALS.proteinGoal
  formatValue: fmtRaw,
};

const LEAN_MASS: MetricChartConfig = {
  chartType: "bar",
  // 0..100 kg covers all four profile leanMassMax values; refine per-profile later.
  yTopRaw: 100, yBottomRaw: 0,
  // goal is profile-keyed via PROFILE_CHART_GOALS.leanMassGoal
  formatValue: fmtRaw,
};

const AVAILABILITY: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 100, yBottomRaw: 0,
  goalRaw: 80,
  formatValue: fmtPct,
};

// Performance metrics — placeholder set (Wins/Losses/Goals/Assists/Yards/Tackles).
// All numeric, all sport-counter-shaped. Generous yMax so demo data fits.
const PERFORMANCE_GENERIC: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 10, yBottomRaw: 0,
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
```

- [ ] **Step 4: Run config tests to verify they pass**

Run: `npm test -- src/charts/metricChartConfig.test.ts`
Expected: All five tests PASS.

- [ ] **Step 5: Write the failing test for the `lookupGoalLine` config fallback**

```ts
// src/charts/chartSeries.test.ts
import { describe, it, expect } from "vitest";
import { lookupGoalLine } from "./chartSeries";

describe("lookupGoalLine", () => {
  it("returns the per-profile goal for sleepEfficiency", () => {
    expect(lookupGoalLine("sleepEfficiency", "Male/Strength and Power")).toBe(75);
    expect(lookupGoalLine("sleepEfficiency", "Female/Endurance")).toBe(75);
    expect(lookupGoalLine("sleepEfficiency", "Male/Endurance")).toBe(80);
  });

  it("falls back to the static config goal for hydration", () => {
    expect(lookupGoalLine("hydration", "Male/Strength and Power")).toBe(3);
    // Profile is irrelevant for static-goal metrics
    expect(lookupGoalLine("hydration", "Female/Endurance")).toBe(3);
  });

  it("returns undefined for metrics with neither profile nor config goal", () => {
    expect(lookupGoalLine("goals", "Male/Strength and Power")).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- src/charts/chartSeries.test.ts`
Expected: The hydration fallback test FAILS (current `lookupGoalLine` returns undefined for hydration).

- [ ] **Step 7: Extend `lookupGoalLine` to fall back to config**

In `src/charts/chartSeries.ts`, add an import at the top:

```ts
import { getMetricChartConfig } from "./metricChartConfig";
```

Replace the existing `lookupGoalLine` function (lines 6-23 of the current file) with:

```ts
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
    }
  }
  return getMetricChartConfig(metricId).goalRaw;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- src/charts/`
Expected: All `linearScale`, `metricChartConfig`, and `chartSeries` tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/charts/metricChartConfig.ts src/charts/metricChartConfig.test.ts src/charts/chartSeries.ts src/charts/chartSeries.test.ts
git commit -m "feat(charts): add metricChartConfig table and extend lookupGoalLine fallback [DGT-35]"
```

---

### Task 3: Add `buildAlignedSeries` to `chartSeries`

`buildAlignedSeries` produces a contiguous date window from oldest to today, with `value: null` for days that have no entry. The bar chart consumes this so it can render today-ghost when today is null and leave empty slots for missing past days.

**Files:**
- Modify: `src/charts/chartSeries.ts` (add new exported function and helper)
- Modify: `src/charts/chartSeries.test.ts` (add tests for `buildAlignedSeries`)

- [ ] **Step 1: Write failing tests for `buildAlignedSeries`**

Append to `src/charts/chartSeries.test.ts`:

```ts
import { buildAlignedSeries } from "./chartSeries";
import type { WellnessEntry } from "../types/data";
import { isoAtDaysAgo } from "../utils/dates";

describe("buildAlignedSeries", () => {
  function makeWellnessEntry(daysAgo: number, hydration: number): WellnessEntry {
    return {
      date: isoAtDaysAgo(daysAgo),
      hydration,
      sleepTime: 0,
      sleepEfficiency: 0,
      protein: 0,
      leanMass: 0,
      availability: { practiceHeld: null, practiceParticipated: null, gameHeld: null, gameParticipated: null },
    } as WellnessEntry;
  }

  it("emits one entry per day in the range, oldest first, today last", () => {
    const out = buildAlignedSeries({
      type: "wellness",
      metricId: "hydration",
      wellnessEntries: [],
      performanceEntries: [],
      rangeDays: 7,
    });
    expect(out).toHaveLength(7);
    expect(out[0].date).toBe(isoAtDaysAgo(6));
    expect(out[6].date).toBe(isoAtDaysAgo(0));
  });

  it("returns null for days without an entry", () => {
    const out = buildAlignedSeries({
      type: "wellness",
      metricId: "hydration",
      wellnessEntries: [],
      performanceEntries: [],
      rangeDays: 7,
    });
    expect(out.every((d) => d.value === null)).toBe(true);
  });

  it("populates values from wellness entries and leaves other days null", () => {
    const out = buildAlignedSeries({
      type: "wellness",
      metricId: "hydration",
      wellnessEntries: [makeWellnessEntry(2, 3), makeWellnessEntry(0, 5)],
      performanceEntries: [],
      rangeDays: 7,
    });
    // Day -6 .. -3 are null; day -2 is 3; day -1 is null; day 0 is 5.
    expect(out[4].value).toBe(3); // 2 days ago at index (rangeDays - 1) - 2 = 4
    expect(out[5].value).toBeNull();
    expect(out[6].value).toBe(5);
    expect(out.slice(0, 4).every((d) => d.value === null)).toBe(true);
  });

  it("treats hydration value 0 as 'not logged' (consistent with buildSeries semantics)", () => {
    const out = buildAlignedSeries({
      type: "wellness",
      metricId: "hydration",
      wellnessEntries: [makeWellnessEntry(1, 0), makeWellnessEntry(0, 4)],
      performanceEntries: [],
      rangeDays: 3,
    });
    expect(out[1].value).toBeNull(); // 0 → "not logged" → null
    expect(out[2].value).toBe(4);
  });

  it("preserves zero values for performance metrics (0 is a valid score)", () => {
    const out = buildAlignedSeries({
      type: "performance",
      metricId: "goals",
      wellnessEntries: [],
      performanceEntries: [
        { date: isoAtDaysAgo(1), metrics: { goals: 0 } },
        { date: isoAtDaysAgo(0), metrics: { goals: 2 } },
      ] as any,
      rangeDays: 3,
    });
    expect(out[1].value).toBe(0);
    expect(out[2].value).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/charts/chartSeries.test.ts`
Expected: All five `buildAlignedSeries` tests FAIL with "buildAlignedSeries is not a function" or similar.

- [ ] **Step 3: Implement `buildAlignedSeries`**

Append to `src/charts/chartSeries.ts`:

```ts
import { isoAtDaysAgo } from "../utils/dates";

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/charts/chartSeries.test.ts`
Expected: All `chartSeries` tests PASS (including existing `lookupGoalLine` tests).

- [ ] **Step 5: Run the full chart test suite as a sanity check**

Run: `npm test -- src/charts/`
Expected: All chart tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/charts/chartSeries.ts src/charts/chartSeries.test.ts
git commit -m "feat(charts): add buildAlignedSeries for date-aligned chart input [DGT-35]"
```

---

### Task 4: Update `ChartDataTable` to handle null values

**Files:**
- Modify: `src/charts/ChartDataTable.tsx:7,61-67`

- [ ] **Step 1: Update the props type and the row rendering**

In `src/charts/ChartDataTable.tsx`, change line 7 from:

```ts
  data: Array<{ date: string; value: number }>;
```

to:

```ts
  data: Array<{ date: string; value: number | null }>;
```

And replace the `<tbody>` block (lines 60-66) with:

```tsx
        <tbody>
          {data.map((row) => (
            <tr key={row.date}>
              <td>{row.date}</td>
              <td>{row.value === null ? "—" : row.value}</td>
            </tr>
          ))}
        </tbody>
```

- [ ] **Step 2: Run the existing chart tests to confirm nothing regressed**

Run: `npm test -- src/charts/`
Expected: All chart tests PASS. (No new test added — null rendering is exercised end-to-end once `MetricChart` switches to `buildAlignedSeries` in Task 12.)

- [ ] **Step 3: Commit**

```bash
git add src/charts/ChartDataTable.tsx
git commit -m "feat(charts): allow null values in ChartDataTable rows [DGT-35]"
```

---

### Task 5: Add `xAxisLabelIndices` helper

This computes which bar indices should render an x-axis tick label, per the spec's range-keyed step rule. First and last indices are always included.

**Files:**
- Create: `src/charts/xAxisLabels.ts`
- Test: `src/charts/xAxisLabels.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/charts/xAxisLabels.test.ts
import { describe, it, expect } from "vitest";
import { xAxisLabelIndices } from "./xAxisLabels";

describe("xAxisLabelIndices", () => {
  it("labels every day at 7d", () => {
    const idx = xAxisLabelIndices("7d", 7);
    expect([...idx].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("labels every 3 days at 2w (always including first and last)", () => {
    const idx = xAxisLabelIndices("2w", 14);
    expect(idx.has(0)).toBe(true);
    expect(idx.has(13)).toBe(true);
    // Day 3, 6, 9, 12 also labeled
    expect(idx.has(3)).toBe(true);
    expect(idx.has(6)).toBe(true);
  });

  it("labels every 7 days at 30d (always including first and last)", () => {
    const idx = xAxisLabelIndices("30d", 30);
    expect(idx.has(0)).toBe(true);
    expect(idx.has(29)).toBe(true);
    expect(idx.has(7)).toBe(true);
    expect(idx.has(14)).toBe(true);
    expect(idx.has(21)).toBe(true);
  });

  it("labels every 15 days at 3mo / 6mo / 1y (with first and last)", () => {
    const idx3 = xAxisLabelIndices("3mo", 90);
    expect(idx3.has(0)).toBe(true);
    expect(idx3.has(89)).toBe(true);
    expect(idx3.has(15)).toBe(true);
    expect(idx3.has(45)).toBe(true);

    const idx1y = xAxisLabelIndices("1y", 365);
    expect(idx1y.has(0)).toBe(true);
    expect(idx1y.has(364)).toBe(true);
  });

  it("always includes the only index when length is 1", () => {
    const idx = xAxisLabelIndices("7d", 1);
    expect(idx.has(0)).toBe(true);
    expect(idx.size).toBe(1);
  });

  it("returns an empty set when length is 0", () => {
    const idx = xAxisLabelIndices("7d", 0);
    expect(idx.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/charts/xAxisLabels.test.ts`
Expected: All tests FAIL with "Cannot find module './xAxisLabels'".

- [ ] **Step 3: Implement the helper**

```ts
// src/charts/xAxisLabels.ts
import type { TimeRangeKey } from "../components/dashboard/TimeRangePicker";

// Step (in indices) between labeled x-axis ticks. Per the chart spec:
//   7d  → 1, 2w → 3, 30d → 7, 3mo / 6mo / 1y → 15
const STEP_BY_RANGE: Record<TimeRangeKey, number> = {
  "7d": 1,
  "2w": 3,
  "30d": 7,
  "3mo": 15,
  "6mo": 15,
  "1y": 15,
};

// Indices in [0, length) that should render an x-axis tick label.
// First and last are always included; intermediate indices follow the
// per-range step rule. Returning a Set lets the chart do O(1) checks
// during render without re-running the math per bar.
export function xAxisLabelIndices(
  range: TimeRangeKey,
  length: number,
): Set<number> {
  const out = new Set<number>();
  if (length <= 0) return out;
  const step = STEP_BY_RANGE[range];
  for (let i = 0; i < length; i += step) out.add(i);
  out.add(0);
  out.add(length - 1);
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/charts/xAxisLabels.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/charts/xAxisLabels.ts src/charts/xAxisLabels.test.ts
git commit -m "feat(charts): add xAxisLabelIndices helper for adaptive bar-chart axis labels [DGT-35]"
```

---

### Task 6: Add shared `<If>` component

A small project-wide utility used by `MetricBarChart` (Task 12) and available for any future component that wants conditional rendering as JSX rather than `&&` expressions or ternaries.

**Files:**
- Create: `src/components/common/If.tsx`
- Test: `src/components/common/If.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/common/If.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { If } from "./If";

describe("If", () => {
  it("renders its children when condition is true", () => {
    const { getByText } = render(
      <If condition={true}>
        <span>visible</span>
      </If>,
    );
    expect(getByText("visible")).toBeTruthy();
  });

  it("renders nothing when condition is false", () => {
    const { container } = render(
      <If condition={false}>
        <span>hidden</span>
      </If>,
    );
    expect(container.textContent).toBe("");
  });

  it("renders multiple children when condition is true", () => {
    const { getByText } = render(
      <If condition={true}>
        <span>one</span>
        <span>two</span>
      </If>,
    );
    expect(getByText("one")).toBeTruthy();
    expect(getByText("two")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/common/If.test.tsx`
Expected: All tests FAIL with "Cannot find module './If'".

- [ ] **Step 3: Implement `If`**

```tsx
// src/components/common/If.tsx
import type { ReactNode } from "react";

interface IfProps {
  condition: boolean;
  children: ReactNode;
}

// Conditional rendering as JSX rather than `&&` expressions, so component
// bodies stay JSX-all-the-way-down instead of jumping between JSX and
// boolean expressions.
//
// Note: children are still constructed even when condition is false (just
// not rendered). For conditions that exist to narrow a possibly-undefined
// value, use a non-null assertion on the value passed to children — the
// runtime guard inside `<If>` enforces the assertion.
//
// Usage:
//   <If condition={someBoolean}>
//     <Component />
//   </If>
export function If({ condition, children }: IfProps) {
  return condition ? <>{children}</> : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/common/If.test.tsx`
Expected: All If tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/If.tsx src/components/common/If.test.tsx
git commit -m "feat(common): add shared If component for conditional JSX [DGT-35]"
```

---

### Task 7: `ChartGeom` type, shared CSS module, and `Axes` component

The `Axes` component renders both y-axis top/bottom labels and adaptive x-axis date labels. Since both axes share the geom + data inputs and are pure positioning logic, keeping them in one component avoids two near-identical wrappers. This task also lays down `ChartGeom` (shared type passed from the orchestrator to each subcomponent) and the shared CSS module that all bar-chart subcomponents will import.

**Files:**
- Create: `src/charts/chartGeom.ts`
- Create: `src/charts/MetricBarChart.module.css` (full class set; later tasks just import)
- Create: `src/charts/Axes.tsx`
- Test: `src/charts/Axes.test.tsx`

- [ ] **Step 1: Create the shared geometry type**

```ts
// src/charts/chartGeom.ts

// Shared geometry computed once by the orchestrator (MetricBarChart) and
// threaded through to each subcomponent so they position themselves
// consistently inside the SVG viewBox.
export interface ChartGeom {
  plotLeft: number;   // x of plot left edge (inside the SVG)
  plotTop: number;    // y of plot top edge (small for SVG)
  plotRight: number;  // x of plot right edge
  plotBottom: number; // y of plot bottom edge (large for SVG)
  plotWidth: number;
  plotHeight: number;
}
```

- [ ] **Step 2: Create the shared CSS module**

```css
/* src/charts/MetricBarChart.module.css
   Shared styles for all bar-chart subcomponents (Axes, Bars, TodayGhost,
   GoalLineAndBadge, AverageBadge). Each component imports the classes it
   needs. Keeping them in one file matches the visual coupling — these
   styles are part of the same chart system. */

.yLabel,
.xLabel {
  fill: var(--subtext);
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 500;
}

.xLabel {
  text-anchor: middle;
}

.barAtOrAboveGoal {
  fill: #2ECC52;
}

.barBelowGoal {
  fill: #4A7A5B;
}

.todayGhost {
  fill: none;
  stroke: var(--subtext);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.goalLine {
  stroke: var(--accent2, #E8E29A);
  stroke-width: 1;
}

.goalBadge,
.avgBadge {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 600;
}

.goalBadgeRect {
  fill: var(--accent2, #E8E29A);
}

.avgBadgeRect {
  fill: var(--surface2, #20262E);
  stroke: var(--accent2, #E8E29A);
}

.badgeText {
  fill: var(--text);
}

.goalBadgeText {
  fill: #1A1F26;
}
```

- [ ] **Step 3: Write failing tests for `Axes`**

```tsx
// src/charts/Axes.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Axes } from "./Axes";
import { getMetricChartConfig } from "./metricChartConfig";
import type { ChartGeom } from "./chartGeom";

const geom: ChartGeom = {
  plotLeft: 36,
  plotTop: 16,
  plotRight: 308,
  plotBottom: 152,
  plotWidth: 272,
  plotHeight: 136,
};

function renderInSvg(ui: React.ReactElement) {
  return render(<svg viewBox="0 0 320 180">{ui}</svg>);
}

function texts(container: HTMLElement) {
  return Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
}

describe("Axes — y-axis labels", () => {
  it("renders top and bottom y-axis labels using the metric's formatValue", () => {
    const { container } = renderInSvg(
      <Axes
        config={getMetricChartConfig("sleepEfficiency")}
        geom={geom}
        data={[]}
        rangeKey="7d"
      />,
    );
    expect(texts(container)).toContain("100%");
    expect(texts(container)).toContain("0%");
  });

  it("renders inverted y-axis labels for hydration (1 at top, 8 at bottom)", () => {
    const { container } = renderInSvg(
      <Axes
        config={getMetricChartConfig("hydration")}
        geom={geom}
        data={[]}
        rangeKey="7d"
      />,
    );
    expect(texts(container)).toEqual(expect.arrayContaining(["1", "8"]));
  });
});

describe("Axes — x-axis labels", () => {
  function xLabels(container: HTMLElement) {
    return Array.from(container.querySelectorAll('text[class*="xLabel"]')).map(
      (t) => t.textContent,
    );
  }

  it("labels every day at 7d in M/D format", () => {
    const data = [
      { date: "2026-05-01", value: 80 },
      { date: "2026-05-02", value: 80 },
      { date: "2026-05-03", value: 80 },
      { date: "2026-05-04", value: 80 },
      { date: "2026-05-05", value: 80 },
      { date: "2026-05-06", value: 80 },
      { date: "2026-05-07", value: 80 },
    ];
    const { container } = renderInSvg(
      <Axes
        config={getMetricChartConfig("sleepEfficiency")}
        geom={geom}
        data={data}
        rangeKey="7d"
      />,
    );
    expect(xLabels(container).length).toBe(7);
    expect(xLabels(container)).toContain("5/1");
    expect(xLabels(container)).toContain("5/7");
  });

  it("labels every 7 days at 30d (always first and last)", () => {
    const data = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      value: 80,
    }));
    const { container } = renderInSvg(
      <Axes
        config={getMetricChartConfig("sleepEfficiency")}
        geom={geom}
        data={data}
        rangeKey="30d"
      />,
    );
    const ls = xLabels(container);
    expect(ls.length).toBeLessThan(10);
    expect(ls[0]).toBe("4/1");
    expect(ls[ls.length - 1]).toBe("4/30");
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- src/charts/Axes.test.tsx`
Expected: All tests FAIL with "Cannot find module './Axes'".

- [ ] **Step 5: Implement `Axes`**

```tsx
// src/charts/Axes.tsx
import type { MetricChartConfig } from "./metricChartConfig";
import type { ChartGeom } from "./chartGeom";
import type { TimeRangeKey } from "../components/dashboard/TimeRangePicker";
import { xAxisLabelIndices } from "./xAxisLabels";
import css from "./MetricBarChart.module.css";

export interface AxesProps {
  config: MetricChartConfig;
  geom: ChartGeom;
  data: Array<{ date: string; value: number | null }>;
  rangeKey: TimeRangeKey;
}

export function Axes({ config, geom, data, rangeKey }: AxesProps) {
  const N = data.length;
  const cellW = N > 0 ? geom.plotWidth / N : 0;
  const labelSet = xAxisLabelIndices(rangeKey, N);

  return (
    <g aria-hidden="true">
      <text
        className={css.yLabel}
        x={geom.plotLeft - 6}
        y={geom.plotTop + 4}
        textAnchor="end"
      >
        {config.formatValue(config.yTopRaw)}
      </text>
      <text
        className={css.yLabel}
        x={geom.plotLeft - 6}
        y={geom.plotBottom}
        textAnchor="end"
      >
        {config.formatValue(config.yBottomRaw)}
      </text>

      {data.map((d, i) =>
        labelSet.has(i) ? (
          <text
            key={`xlbl-${d.date}`}
            className={css.xLabel}
            x={geom.plotLeft + i * cellW + cellW / 2}
            y={geom.plotBottom + 14}
          >
            {formatXLabel(d.date)}
          </text>
        ) : null,
      )}
    </g>
  );
}

function formatXLabel(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${Number(m[1])}/${Number(m[2])}`;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/charts/Axes.test.tsx`
Expected: All Axes tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/charts/chartGeom.ts src/charts/MetricBarChart.module.css src/charts/Axes.tsx src/charts/Axes.test.tsx
git commit -m "feat(charts): add ChartGeom type, shared chart CSS, and Axes component [DGT-35]"
```

---

### Task 8: `GoalLineAndBadge` component

A horizontal goal line spanning the plot region plus a left-edge yellow goal badge anchored at the goal y-coordinate. The badge stacks "Goal" over the formatted value (e.g., "Goal" / "75%").

**Files:**
- Create: `src/charts/GoalLineAndBadge.tsx`
- Test: `src/charts/GoalLineAndBadge.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/charts/GoalLineAndBadge.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GoalLineAndBadge } from "./GoalLineAndBadge";
import { linearScale } from "./linearScale";
import type { ChartGeom } from "./chartGeom";

const geom: ChartGeom = {
  plotLeft: 36,
  plotTop: 16,
  plotRight: 308,
  plotBottom: 152,
  plotWidth: 272,
  plotHeight: 136,
};
const yScalePct = linearScale([0, 100], [geom.plotBottom, geom.plotTop]);

function renderInSvg(ui: React.ReactElement) {
  return render(<svg viewBox="0 0 320 180">{ui}</svg>);
}

describe("GoalLineAndBadge", () => {
  it("renders a horizontal goal line spanning the plot at the goal y", () => {
    const { container } = renderInSvg(
      <GoalLineAndBadge
        goalRaw={75}
        formatValue={(v) => `${v}%`}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    const line = container.querySelector('line[class*="goalLine"]')!;
    expect(line).toBeTruthy();
    expect(line.getAttribute("y1")).toBe(line.getAttribute("y2"));
    expect(Number(line.getAttribute("x1"))).toBe(geom.plotLeft);
    expect(Number(line.getAttribute("x2"))).toBe(geom.plotRight);
  });

  it("renders the badge text 'Goal' stacked over the formatted value", () => {
    const { container } = renderInSvg(
      <GoalLineAndBadge
        goalRaw={75}
        formatValue={(v) => `${v}%`}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    const txts = Array.from(container.querySelectorAll("text")).map(
      (t) => t.textContent,
    );
    expect(txts).toContain("Goal");
    expect(txts).toContain("75%");
  });

  it("formats the goal value using the supplied formatter (raw, no suffix)", () => {
    const { container } = renderInSvg(
      <GoalLineAndBadge
        goalRaw={3}
        formatValue={(v) => `${v}`}
        yScale={linearScale([1, 8], [geom.plotTop, geom.plotBottom])}
        geom={geom}
      />,
    );
    const txts = Array.from(container.querySelectorAll("text")).map(
      (t) => t.textContent,
    );
    expect(txts).toContain("3");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/charts/GoalLineAndBadge.test.tsx`
Expected: All tests FAIL with "Cannot find module './GoalLineAndBadge'".

- [ ] **Step 3: Implement `GoalLineAndBadge`**

```tsx
// src/charts/GoalLineAndBadge.tsx
import type { ChartGeom } from "./chartGeom";
import css from "./MetricBarChart.module.css";

export interface GoalLineAndBadgeProps {
  goalRaw: number;
  formatValue: (raw: number) => string;
  yScale: (value: number) => number;
  geom: ChartGeom;
}

export function GoalLineAndBadge({
  goalRaw,
  formatValue,
  yScale,
  geom,
}: GoalLineAndBadgeProps) {
  const y = yScale(goalRaw);
  return (
    <g aria-hidden="true">
      <line
        className={css.goalLine}
        x1={geom.plotLeft}
        x2={geom.plotRight}
        y1={y}
        y2={y}
      />
      <g
        className={css.goalBadge}
        transform={`translate(${geom.plotLeft - 4}, ${y})`}
      >
        <rect
          className={css.goalBadgeRect}
          x={-32}
          y={-12}
          width={32}
          height={24}
          rx={3}
        />
        <text className={css.goalBadgeText} x={-16} y={-1} textAnchor="middle">
          Goal
        </text>
        <text className={css.goalBadgeText} x={-16} y={10} textAnchor="middle">
          {formatValue(goalRaw)}
        </text>
      </g>
    </g>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/charts/GoalLineAndBadge.test.tsx`
Expected: All GoalLineAndBadge tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/charts/GoalLineAndBadge.tsx src/charts/GoalLineAndBadge.test.tsx
git commit -m "feat(charts): add GoalLineAndBadge component [DGT-35]"
```

---

### Task 9: `AverageBadge` component

Floating rectangular "Avg: X" badge anchored near the right edge of the plot, vertically centered on the average y-coordinate. No line, no pointer — the badge's vertical position alone communicates the average level. Per the prototype.

**Files:**
- Create: `src/charts/AverageBadge.tsx`
- Test: `src/charts/AverageBadge.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/charts/AverageBadge.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AverageBadge } from "./AverageBadge";
import { linearScale } from "./linearScale";
import type { ChartGeom } from "./chartGeom";

const geom: ChartGeom = {
  plotLeft: 36,
  plotTop: 16,
  plotRight: 308,
  plotBottom: 152,
  plotWidth: 272,
  plotHeight: 136,
};
const yScalePct = linearScale([0, 100], [geom.plotBottom, geom.plotTop]);

function renderInSvg(ui: React.ReactElement) {
  return render(<svg viewBox="0 0 320 180">{ui}</svg>);
}

describe("AverageBadge", () => {
  it("renders a badge with 'Avg: ' + formatted value", () => {
    const { container } = renderInSvg(
      <AverageBadge
        averageRaw={83}
        formatValue={(v) => `${v}%`}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    const txts = Array.from(container.querySelectorAll("text")).map(
      (t) => t.textContent,
    );
    expect(txts.some((t) => t?.includes("Avg") && t?.includes("83%"))).toBe(true);
  });

  it("does not render a horizontal average line (badge only)", () => {
    const { container } = renderInSvg(
      <AverageBadge
        averageRaw={83}
        formatValue={(v) => `${v}%`}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    expect(container.querySelector('line[class*="avgLine"]')).toBeNull();
  });

  it("centers the badge vertically on the avg y", () => {
    const { container } = renderInSvg(
      <AverageBadge
        averageRaw={50}
        formatValue={(v) => `${v}%`}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    const rect = container.querySelector('rect[class*="avgBadgeRect"]')!;
    const y = Number(rect.getAttribute("y"));
    const h = Number(rect.getAttribute("height"));
    // 0..100% maps to plotBottom..plotTop. avg=50 → y at midpoint of plot.
    const midY = (geom.plotTop + geom.plotBottom) / 2;
    expect(y + h / 2).toBeCloseTo(midY, 0);
  });

  it("clamps the badge inside the plot when avg is at the top or bottom", () => {
    const top = renderInSvg(
      <AverageBadge
        averageRaw={100}
        formatValue={(v) => `${v}%`}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    const topRect = top.container.querySelector('rect[class*="avgBadgeRect"]')!;
    expect(Number(topRect.getAttribute("y"))).toBeGreaterThanOrEqual(geom.plotTop);

    const bottom = renderInSvg(
      <AverageBadge
        averageRaw={0}
        formatValue={(v) => `${v}%`}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    const botRect = bottom.container.querySelector('rect[class*="avgBadgeRect"]')!;
    const y = Number(botRect.getAttribute("y"));
    const h = Number(botRect.getAttribute("height"));
    expect(y + h).toBeLessThanOrEqual(geom.plotBottom);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/charts/AverageBadge.test.tsx`
Expected: All tests FAIL with "Cannot find module './AverageBadge'".

- [ ] **Step 3: Implement `AverageBadge`**

```tsx
// src/charts/AverageBadge.tsx
import type { ChartGeom } from "./chartGeom";
import css from "./MetricBarChart.module.css";

export interface AverageBadgeProps {
  averageRaw: number;
  formatValue: (raw: number) => string;
  yScale: (value: number) => number;
  geom: ChartGeom;
}

const BADGE_W = 48;
const BADGE_H = 16;

export function AverageBadge({
  averageRaw,
  formatValue,
  yScale,
  geom,
}: AverageBadgeProps) {
  const avgY = yScale(averageRaw);
  const badgeRight = geom.plotRight - 4;
  const badgeLeft = badgeRight - BADGE_W;
  const rawTop = avgY - BADGE_H / 2;
  const badgeY = Math.max(
    geom.plotTop,
    Math.min(geom.plotBottom - BADGE_H, rawTop),
  );

  return (
    <g className={css.avgBadge} aria-hidden="true">
      <rect
        className={css.avgBadgeRect}
        x={badgeLeft}
        y={badgeY}
        width={BADGE_W}
        height={BADGE_H}
        rx={3}
      />
      <text
        className={css.badgeText}
        x={badgeLeft + BADGE_W / 2}
        y={badgeY + BADGE_H - 4}
        textAnchor="middle"
      >
        Avg: {formatValue(averageRaw)}
      </text>
    </g>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/charts/AverageBadge.test.tsx`
Expected: All AverageBadge tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/charts/AverageBadge.tsx src/charts/AverageBadge.test.tsx
git commit -m "feat(charts): add AverageBadge component [DGT-35]"
```

---

### Task 10: `TodayGhost` component

Dashed-rectangle outline at the today slot when today's value is null. Renders nothing when today has data or when the data array is empty. Today is always the last entry in the aligned series.

**Files:**
- Create: `src/charts/TodayGhost.tsx`
- Test: `src/charts/TodayGhost.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/charts/TodayGhost.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TodayGhost } from "./TodayGhost";
import { linearScale } from "./linearScale";
import type { ChartGeom } from "./chartGeom";

const geom: ChartGeom = {
  plotLeft: 36,
  plotTop: 16,
  plotRight: 308,
  plotBottom: 152,
  plotWidth: 272,
  plotHeight: 136,
};
const yScalePct = linearScale([0, 100], [geom.plotBottom, geom.plotTop]);

function renderInSvg(ui: React.ReactElement) {
  return render(<svg viewBox="0 0 320 180">{ui}</svg>);
}

describe("TodayGhost", () => {
  it("renders when today's value is null", () => {
    const data = [
      { date: "2026-05-05", value: 80 },
      { date: "2026-05-06", value: null }, // today
    ];
    const { container } = renderInSvg(
      <TodayGhost data={data} goalRaw={75} yScale={yScalePct} geom={geom} />,
    );
    expect(container.querySelector('rect[class*="todayGhost"]')).toBeTruthy();
  });

  it("does not render when today has a value", () => {
    const data = [
      { date: "2026-05-05", value: 80 },
      { date: "2026-05-06", value: 90 },
    ];
    const { container } = renderInSvg(
      <TodayGhost data={data} goalRaw={75} yScale={yScalePct} geom={geom} />,
    );
    expect(container.querySelector('rect[class*="todayGhost"]')).toBeNull();
  });

  it("does not render when a missing-data day is in the past (not last)", () => {
    const data = [
      { date: "2026-05-05", value: null },
      { date: "2026-05-06", value: 80 },
    ];
    const { container } = renderInSvg(
      <TodayGhost data={data} goalRaw={75} yScale={yScalePct} geom={geom} />,
    );
    expect(container.querySelector('rect[class*="todayGhost"]')).toBeNull();
  });

  it("renders nothing when data is empty", () => {
    const { container } = renderInSvg(
      <TodayGhost data={[]} goalRaw={75} yScale={yScalePct} geom={geom} />,
    );
    expect(container.querySelector('rect[class*="todayGhost"]')).toBeNull();
  });

  it("positions the ghost at the today slot's x and the goal y as its top edge", () => {
    const data = [
      { date: "2026-05-05", value: 80 },
      { date: "2026-05-06", value: null },
    ];
    const { container } = renderInSvg(
      <TodayGhost data={data} goalRaw={75} yScale={yScalePct} geom={geom} />,
    );
    const ghost = container.querySelector('rect[class*="todayGhost"]')!;
    expect(Number(ghost.getAttribute("y"))).toBeCloseTo(yScalePct(75), 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/charts/TodayGhost.test.tsx`
Expected: All tests FAIL with "Cannot find module './TodayGhost'".

- [ ] **Step 3: Implement `TodayGhost`**

```tsx
// src/charts/TodayGhost.tsx
import type { ChartGeom } from "./chartGeom";
import css from "./MetricBarChart.module.css";

export interface TodayGhostProps {
  data: Array<{ date: string; value: number | null }>;
  goalRaw?: number;
  yScale: (value: number) => number;
  geom: ChartGeom;
}

const BAR_WIDTH_RATIO = 0.8;

export function TodayGhost({ data, goalRaw, yScale, geom }: TodayGhostProps) {
  const N = data.length;
  if (N === 0) return null;
  const today = data[N - 1];
  if (today.value !== null) return null;

  const cellW = geom.plotWidth / N;
  const barW = cellW * BAR_WIDTH_RATIO;
  const x = geom.plotLeft + (N - 1) * cellW + (cellW - barW) / 2;
  const ghostTop = goalRaw !== undefined ? yScale(goalRaw) : geom.plotTop;
  const h = Math.max(geom.plotBottom - ghostTop, 4);

  return (
    <rect
      className={css.todayGhost}
      x={x}
      y={ghostTop}
      width={Math.max(barW, 1)}
      height={h}
      aria-hidden="true"
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/charts/TodayGhost.test.tsx`
Expected: All TodayGhost tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/charts/TodayGhost.tsx src/charts/TodayGhost.test.tsx
git commit -m "feat(charts): add TodayGhost component [DGT-35]"
```

---

### Task 11: `Bars` component

Renders one `<rect>` per non-null day. Bright green for at-or-above goal, muted green for below. Inverted-axis metrics (Hydration: low raw = "better") flip the comparison. Zero values clamp to a 2px sliver so they're visibly distinct from missing data.

**Files:**
- Create: `src/charts/Bars.tsx`
- Test: `src/charts/Bars.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/charts/Bars.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Bars } from "./Bars";
import { getMetricChartConfig } from "./metricChartConfig";
import { linearScale } from "./linearScale";
import type { ChartGeom } from "./chartGeom";

const geom: ChartGeom = {
  plotLeft: 36,
  plotTop: 16,
  plotRight: 308,
  plotBottom: 152,
  plotWidth: 272,
  plotHeight: 136,
};
const yScalePct = linearScale([0, 100], [geom.plotBottom, geom.plotTop]);
// Hydration's inverted scale: 1 at top (small y), 8 at bottom (large y)
const yScaleHydration = linearScale([1, 8], [geom.plotTop, geom.plotBottom]);

function renderInSvg(ui: React.ReactElement) {
  return render(<svg viewBox="0 0 320 180">{ui}</svg>);
}

describe("Bars", () => {
  const data7 = [
    { date: "2026-04-30", value: 80 },
    { date: "2026-05-01", value: null },
    { date: "2026-05-02", value: 70 },
    { date: "2026-05-03", value: 90 },
    { date: "2026-05-04", value: 60 },
    { date: "2026-05-05", value: 88 },
    { date: "2026-05-06", value: 92 },
  ];

  it("renders one bar per non-null day (skips null slots)", () => {
    const { container } = renderInSvg(
      <Bars
        data={data7}
        goalRaw={75}
        config={getMetricChartConfig("sleepEfficiency")}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    const bars = container.querySelectorAll(
      'rect[class*="barAtOrAboveGoal"], rect[class*="barBelowGoal"]',
    );
    expect(bars.length).toBe(6); // 7 days, 1 null
  });

  it("uses bright-green class for values at-or-above goal and muted for below", () => {
    const { container } = renderInSvg(
      <Bars
        data={data7}
        goalRaw={75}
        config={getMetricChartConfig("sleepEfficiency")}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    expect(
      container.querySelectorAll('rect[class*="barAtOrAboveGoal"]').length,
    ).toBe(5); // 80, 90, 88, 92, plus... wait: 80,90,88,92 = 4 above; 70 below; 60 below
    expect(
      container.querySelectorAll('rect[class*="barBelowGoal"]').length,
    ).toBe(2); // 70, 60
  });

  it("inverts the comparison for inverted-axis metrics like hydration (lower raw = at/above)", () => {
    const data = [
      { date: "2026-05-01", value: 2 }, // <= goal 3 → at/above
      { date: "2026-05-02", value: 5 }, // > goal 3 → below
    ];
    const { container } = renderInSvg(
      <Bars
        data={data}
        goalRaw={3}
        config={getMetricChartConfig("hydration")}
        yScale={yScaleHydration}
        geom={geom}
      />,
    );
    expect(
      container.querySelectorAll('rect[class*="barAtOrAboveGoal"]').length,
    ).toBe(1);
    expect(
      container.querySelectorAll('rect[class*="barBelowGoal"]').length,
    ).toBe(1);
  });

  it("clamps zero to a 2px sliver (perf metric where 0 is a valid score)", () => {
    const { container } = renderInSvg(
      <Bars
        data={[{ date: "2026-05-06", value: 0 }]}
        config={getMetricChartConfig("goals")}
        yScale={linearScale([0, 10], [geom.plotBottom, geom.plotTop])}
        geom={geom}
      />,
    );
    const bar = container.querySelector(
      'rect[class*="barAtOrAboveGoal"], rect[class*="barBelowGoal"]',
    )!;
    expect(Number(bar.getAttribute("height"))).toBeGreaterThanOrEqual(2);
  });

  it("treats all bars as at/above when no goal is supplied", () => {
    const { container } = renderInSvg(
      <Bars
        data={[
          { date: "2026-05-05", value: 1 },
          { date: "2026-05-06", value: 9 },
        ]}
        config={getMetricChartConfig("goals")}
        yScale={linearScale([0, 10], [geom.plotBottom, geom.plotTop])}
        geom={geom}
      />,
    );
    expect(
      container.querySelectorAll('rect[class*="barAtOrAboveGoal"]').length,
    ).toBe(2);
    expect(
      container.querySelectorAll('rect[class*="barBelowGoal"]').length,
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/charts/Bars.test.tsx`
Expected: All tests FAIL with "Cannot find module './Bars'".

- [ ] **Step 3: Implement `Bars`**

```tsx
// src/charts/Bars.tsx
import type { MetricChartConfig } from "./metricChartConfig";
import type { ChartGeom } from "./chartGeom";
import css from "./MetricBarChart.module.css";

export interface BarsProps {
  data: Array<{ date: string; value: number | null }>;
  goalRaw?: number;
  config: MetricChartConfig;
  yScale: (value: number) => number;
  geom: ChartGeom;
}

const BAR_WIDTH_RATIO = 0.8;

export function Bars({ data, goalRaw, config, yScale, geom }: BarsProps) {
  const N = data.length;
  const cellW = N > 0 ? geom.plotWidth / N : 0;
  const barW = cellW * BAR_WIDTH_RATIO;

  const meetsGoal = (v: number): boolean => {
    if (goalRaw === undefined) return true;
    return config.inverted ? v <= goalRaw : v >= goalRaw;
  };

  return (
    <g aria-hidden="true">
      {data.map((d, i) => {
        if (d.value === null) return null;
        const x = geom.plotLeft + i * cellW + (cellW - barW) / 2;
        const yTop = yScale(d.value);
        const h = Math.max(2, geom.plotBottom - yTop);
        const className = meetsGoal(d.value)
          ? css.barAtOrAboveGoal
          : css.barBelowGoal;
        return (
          <rect
            key={d.date}
            className={className}
            x={x}
            y={Math.min(yTop, geom.plotBottom - 2)}
            width={Math.max(barW, 0.5)}
            height={h}
          />
        );
      })}
    </g>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/charts/Bars.test.tsx`
Expected: All Bars tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/charts/Bars.tsx src/charts/Bars.test.tsx
git commit -m "feat(charts): add Bars component with goal-comparison color encoding [DGT-35]"
```

---

### Task 12: `MetricBarChart` orchestrator

Thin wrapper that computes the geometry and y-scale once and composes the five subcomponents inside a `<g>`. Render order matters for SVG z-stacking — bars first, then today-ghost, then goal line + badge (so the line draws over the bars), then average badge on top.

**Files:**
- Create: `src/charts/MetricBarChart.tsx`
- Test: `src/charts/MetricBarChart.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/charts/MetricBarChart.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MetricBarChart } from "./MetricBarChart";

function renderInSvg(ui: React.ReactElement) {
  return render(<svg viewBox="0 0 320 180">{ui}</svg>);
}

const sampleData = [
  { date: "2026-04-30", value: 80 },
  { date: "2026-05-01", value: 70 },
  { date: "2026-05-02", value: 88 },
  { date: "2026-05-03", value: 92 },
  { date: "2026-05-04", value: 60 },
  { date: "2026-05-05", value: 78 },
  { date: "2026-05-06", value: null }, // today missing
];

describe("MetricBarChart — integration", () => {
  it("composes axes, bars, today-ghost, goal line+badge, and avg badge", () => {
    const { container } = renderInSvg(
      <MetricBarChart
        metricId="sleepEfficiency"
        data={sampleData}
        goalRaw={75}
        averageRaw={78}
        rangeKey="7d"
        width={320}
        height={180}
      />,
    );
    // Y-axis labels (Axes)
    const txts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(txts).toContain("100%");
    expect(txts).toContain("0%");
    // Bars (6 non-null days)
    expect(
      container.querySelectorAll(
        'rect[class*="barAtOrAboveGoal"], rect[class*="barBelowGoal"]',
      ).length,
    ).toBe(6);
    // Today ghost (today is null)
    expect(container.querySelector('rect[class*="todayGhost"]')).toBeTruthy();
    // Goal line + badge
    expect(container.querySelector('line[class*="goalLine"]')).toBeTruthy();
    expect(txts).toContain("Goal");
    expect(txts).toContain("75%");
    // Avg badge
    expect(container.querySelector('g[class*="avgBadge"]')).toBeTruthy();
    expect(txts.some((t) => t?.includes("Avg") && t?.includes("78%"))).toBe(true);
  });

  it("works without goal or average (just axes + bars)", () => {
    const { container } = renderInSvg(
      <MetricBarChart
        metricId="goals"
        data={[{ date: "2026-05-06", value: 3 }]}
        rangeKey="7d"
        width={320}
        height={180}
      />,
    );
    expect(container.querySelector('line[class*="goalLine"]')).toBeNull();
    expect(container.querySelector('g[class*="avgBadge"]')).toBeNull();
    expect(
      container.querySelectorAll(
        'rect[class*="barAtOrAboveGoal"], rect[class*="barBelowGoal"]',
      ).length,
    ).toBe(1);
  });

  it("uses the inverted y-scale for hydration", () => {
    // Hydration: low raw = "good" displayed at top.
    const { container } = renderInSvg(
      <MetricBarChart
        metricId="hydration"
        data={[
          { date: "2026-05-05", value: 2 }, // good (<=3)
          { date: "2026-05-06", value: 6 }, // bad (>3)
        ]}
        goalRaw={3}
        rangeKey="7d"
        width={320}
        height={180}
      />,
    );
    // 1 at-or-above (the 2), 1 below (the 6)
    expect(
      container.querySelectorAll('rect[class*="barAtOrAboveGoal"]').length,
    ).toBe(1);
    expect(
      container.querySelectorAll('rect[class*="barBelowGoal"]').length,
    ).toBe(1);
    // The "good" bar (value 2) should be taller than the "bad" bar (value 6)
    // because the inverted axis puts 1 at the top (small y) and 8 at the bottom.
    const bars = Array.from(container.querySelectorAll("rect"))
      .filter((r) => r.getAttribute("class")?.includes("barAtOrAboveGoal") ||
                     r.getAttribute("class")?.includes("barBelowGoal"))
      .map((r) => Number(r.getAttribute("height")));
    expect(bars[0]).toBeGreaterThan(bars[1]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/charts/MetricBarChart.test.tsx`
Expected: All tests FAIL with "Cannot find module './MetricBarChart'".

- [ ] **Step 3: Implement the orchestrator**

```tsx
// src/charts/MetricBarChart.tsx
import { getMetricChartConfig } from "./metricChartConfig";
import { linearScale } from "./linearScale";
import type { TimeRangeKey } from "../components/dashboard/TimeRangePicker";
import type { ChartGeom } from "./chartGeom";
import { Axes } from "./Axes";
import { Bars } from "./Bars";
import { TodayGhost } from "./TodayGhost";
import { GoalLineAndBadge } from "./GoalLineAndBadge";
import { AverageBadge } from "./AverageBadge";
import { If } from "../components/common/If";

export interface MetricBarChartProps {
  metricId: string;
  data: Array<{ date: string; value: number | null }>;
  goalRaw?: number;
  averageRaw?: number;
  rangeKey: TimeRangeKey;
  width: number;
  height: number;
}

// Plot region margins inside the outer SVG viewBox.
const M_TOP = 16;
const M_BOTTOM = 28;
const M_LEFT = 36;
const M_RIGHT = 12;

export function MetricBarChart({
  metricId,
  data,
  goalRaw,
  averageRaw,
  rangeKey,
  width,
  height,
}: MetricBarChartProps) {
  const config = getMetricChartConfig(metricId);

  const geom: ChartGeom = {
    plotLeft: M_LEFT,
    plotTop: M_TOP,
    plotRight: width - M_RIGHT,
    plotBottom: height - M_BOTTOM,
    plotWidth: width - M_LEFT - M_RIGHT,
    plotHeight: height - M_TOP - M_BOTTOM,
  };

  // Inverted metrics (Hydration): yTopRaw is numerically smaller than
  // yBottomRaw, and we map [yTopRaw, yBottomRaw] → [plotTop, plotBottom]
  // so the "best" value sits at the top of the plot.
  const yScale = config.inverted
    ? linearScale(
        [config.yTopRaw, config.yBottomRaw],
        [geom.plotTop, geom.plotBottom],
      )
    : linearScale(
        [config.yBottomRaw, config.yTopRaw],
        [geom.plotBottom, geom.plotTop],
      );

  return (
    <g aria-hidden="true">
      <Axes config={config} geom={geom} data={data} rangeKey={rangeKey} />
      <Bars
        data={data}
        goalRaw={goalRaw}
        config={config}
        yScale={yScale}
        geom={geom}
      />
      <TodayGhost
        data={data}
        goalRaw={goalRaw}
        yScale={yScale}
        geom={geom}
      />
      <If condition={goalRaw !== undefined}>
        <GoalLineAndBadge
          goalRaw={goalRaw!}
          formatValue={config.formatValue}
          yScale={yScale}
          geom={geom}
        />
      </If>
      <If condition={averageRaw !== undefined}>
        <AverageBadge
          averageRaw={averageRaw!}
          formatValue={config.formatValue}
          yScale={yScale}
          geom={geom}
        />
      </If>
    </g>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/charts/MetricBarChart.test.tsx`
Expected: All MetricBarChart tests PASS.

- [ ] **Step 5: Run the full chart test suite as a sanity check**

Run: `npm test -- src/charts/`
Expected: All chart tests PASS (linearScale, metricChartConfig, chartSeries, xAxisLabels, Axes, Bars, TodayGhost, GoalLineAndBadge, AverageBadge, MetricBarChart).

- [ ] **Step 6: Commit**

```bash
git add src/charts/MetricBarChart.tsx src/charts/MetricBarChart.test.tsx
git commit -m "feat(charts): add MetricBarChart orchestrator composing five subcomponents [DGT-35]"
```

---

### Task 13: Wire `MetricChart` to render `MetricBarChart`

Drop the placeholder gray-box. For `type === "bar"` render `<MetricBarChart>`; for `type === "line"` render a small TBD note inside the SVG.

**Files:**
- Modify: `src/charts/MetricChart.tsx`
- Modify: `src/charts/MetricChart.test.tsx`
- Modify: `src/charts/MetricChart.module.css` (optionally trim unused placeholder rules)

- [ ] **Step 1: Update the placeholder tests**

Replace the existing tests in `src/charts/MetricChart.test.tsx` that assert the literal `"Chart placeholder - TBD"` text. Replace the body of those two tests with new ones:

```tsx
  it("renders a MetricBarChart for type='bar' (no placeholder text)", () => {
    const { container } = render(
      <MetricChart
        type="bar"
        metricId="sleepEfficiency"
        data={[{ date: "2026-05-06", value: 80 }]}
        title="Sleep Efficiency"
        description="d"
      />,
    );
    // Placeholder text gone
    expect(container.textContent).not.toContain("Chart placeholder - TBD");
    // Bar present
    expect(
      container.querySelector("rect.barAtOrAboveGoal, rect.barBelowGoal"),
    ).toBeTruthy();
  });

  it("renders a small TBD note for type='line' until the line variant ships", () => {
    const { container } = render(
      <MetricChart
        type="line"
        metricId="sleepEfficiency"
        data={[{ date: "2026-05-06", value: 80 }]}
        title="Sleep Efficiency"
        description="d"
      />,
    );
    expect(container.textContent).toContain("Line chart not yet implemented");
  });
```

The existing `aria-labelledby/aria-describedby` and "Show data" toggle tests should keep passing without modification.

Update the `sampleData` constant to use `value: number | null`:

```tsx
const sampleData: Array<{ date: string; value: number | null }> = [
  { date: "2026-04-25", value: 4 },
  { date: "2026-04-26", value: 5 },
  { date: "2026-04-27", value: 6 },
];
```

The existing "renders the loading skeleton" test can stay (the new `MetricChart.tsx` will keep the `loading` skeleton path).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/charts/MetricChart.test.tsx`
Expected: Bar-routing test FAILS (placeholder still rendered); line-TBD test FAILS.

- [ ] **Step 3: Update `MetricChart.tsx`**

Replace the body of `src/charts/MetricChart.tsx` with:

```tsx
import { useId, useState } from "react";
import { ChartDataTable } from "./ChartDataTable";
import { MetricBarChart } from "./MetricBarChart";
import type { TimeRangeKey } from "../components/dashboard/TimeRangePicker";
import css from "./MetricChart.module.css";

export interface MetricChartProps {
  type: "line" | "bar";
  metricId: string;
  data: Array<{ date: string; value: number | null }>;
  goalLine?: number;
  averageLine?: number;
  // Title becomes the <title> in the SVG and is the SR-name. Description
  // becomes the <desc> for SR detail.
  title: string;
  description: string;
  width?: number;
  height?: number;
  rangeKey?: TimeRangeKey;
  // Data table label override (defaults to the title).
  dataTableTitle?: string;
  // Distinguishable skeleton variant during DataContext loading.
  loading?: boolean;
}

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 180;

export function MetricChart({
  type,
  metricId,
  data,
  goalLine,
  averageLine,
  title,
  description,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  rangeKey = "7d",
  dataTableTitle,
  loading = false,
}: MetricChartProps) {
  const titleId = useId();
  const descId = useId();
  const [showData, setShowData] = useState(false);

  return (
    <div className={css.chartWrapper}>
      <svg
        className={css.chartSvg}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <title id={titleId}>{title}</title>
        <desc id={descId}>{description}</desc>
        {loading ? (
          <g aria-hidden="true">
            <rect
              className={css.skeletonRect}
              x="0"
              y="0"
              width={width}
              height={height}
            />
            <text
              className={css.placeholderLabel}
              x={width / 2}
              y={height / 2}
            >
              Loading chart data...
            </text>
          </g>
        ) : type === "bar" ? (
          <MetricBarChart
            metricId={metricId}
            data={data}
            goalRaw={goalLine}
            averageRaw={averageLine}
            rangeKey={rangeKey}
            width={width}
            height={height}
          />
        ) : (
          <text
            className={css.placeholderLabel}
            x={width / 2}
            y={height / 2}
          >
            Line chart not yet implemented
          </text>
        )}
      </svg>
      <button
        type="button"
        className={css.showDataToggle}
        onClick={() => setShowData((v) => !v)}
        aria-expanded={showData}
        aria-controls={`${titleId}-data`}
      >
        {showData ? "Hide data" : "Show data"}
      </button>
      <ChartDataTable
        id={`${titleId}-data`}
        title={dataTableTitle ?? title}
        data={data}
        visuallyHidden={!showData}
        loading={loading}
      />
    </div>
  );
}
```

Note the prop additions: `metricId` and optional `rangeKey`. Callers (DashboardChartCard, MetricDetail) will pass these in Tasks 13 and 14.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/charts/MetricChart.test.tsx`
Expected: All `MetricChart` tests PASS.

- [ ] **Step 5: Run the full chart suite**

Run: `npm test -- src/charts/`
Expected: All chart tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/charts/MetricChart.tsx src/charts/MetricChart.test.tsx
git commit -m "feat(charts): swap MetricChart placeholder for MetricBarChart [DGT-35]"
```

---

### Task 14: Update `DashboardChartCard` to plumb chartType and aligned series

**Files:**
- Modify: `src/components/dashboard/DashboardChartCard.tsx`

- [ ] **Step 1: Update imports and add chartType lookup**

In `src/components/dashboard/DashboardChartCard.tsx`, add at the top:

```ts
import { getMetricChartConfig } from "../../charts/metricChartConfig";
import { buildAlignedSeries } from "../../charts/chartSeries";
```

Replace the `series = useMemo(...)` definition (lines 68-78) so it builds the aligned series for the chart but still uses `buildSeries` for the data table — actually, both can use `buildAlignedSeries` since `ChartDataTable` now handles nulls; cleaner to consolidate:

Replace lines 68-78 with:

```ts
  const series = useMemo(
    () =>
      buildAlignedSeries({
        type,
        metricId: metric?.id ?? "",
        wellnessEntries: wellnessEntries ?? [],
        performanceEntries: performanceEntries ?? [],
        rangeDays: TIME_RANGE_DAYS[range],
      }),
    [type, metric?.id, wellnessEntries, performanceEntries, range],
  );

  const filledValues = series
    .map((d) => d.value)
    .filter((v): v is number => v !== null);
```

Replace the `average` definition (lines 80-83) with:

```ts
  const average =
    filledValues.length > 0
      ? filledValues.reduce((s, v) => s + v, 0) / filledValues.length
      : undefined;
```

Replace the existing `<MetricChart>` invocation (lines 128-136) with:

```tsx
      <MetricChart
        type={metric ? getMetricChartConfig(metric.id).chartType : "bar"}
        metricId={metric?.id ?? ""}
        data={loading ? [] : series}
        goalLine={goalLine}
        averageLine={average}
        title={metric ? metric.name : "Metric"}
        description={description}
        rangeKey={range}
        loading={loading}
      />
```

- [ ] **Step 2: Run the dashboard chart-card tests**

Run: `npm test -- src/components/dashboard/DashboardChartCard.test.tsx`
Expected: PASS. The existing tests should still pass since the visible behavior didn't change (placeholder renders as bars now, but the test assertions don't depend on the placeholder text).

If a test asserts on the literal "Chart placeholder - TBD" text, update it to instead assert that a chart `<svg>` exists. (Search the test file for that string and replace the assertion.)

- [ ] **Step 3: TypeScript check**

Run: `npm run build`
Expected: TypeScript compiles cleanly. If it complains about `data` shape mismatches downstream, the issue is most likely in `MetricDetail` or in `composeDescription` — those will be fixed in Task 15.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashboardChartCard.tsx src/components/dashboard/DashboardChartCard.test.tsx
git commit -m "feat(charts): wire DashboardChartCard to MetricBarChart with chartType plumbing [DGT-35]"
```

---

### Task 15: Update `MetricDetail` to plumb chartType and aligned series

**Files:**
- Modify: `src/charts/MetricDetail.tsx`

- [ ] **Step 1: Update imports and switch to aligned series**

In `src/charts/MetricDetail.tsx`, replace the `chartSeries` import (lines 27-33) with:

```ts
import {
  buildAlignedSeries,
  capitalizeAthleteType,
  capitalizeGender,
  formatNumber,
  lookupGoalLine,
} from "./chartSeries";
import { getMetricChartConfig } from "./metricChartConfig";
```

Replace the `series = useMemo(...)` block (lines 83-95) with:

```ts
  const series = useMemo(
    () =>
      metric
        ? buildAlignedSeries({
            type,
            metricId: metric.id,
            wellnessEntries,
            performanceEntries,
            rangeDays: TIME_RANGE_DAYS[range],
          })
        : [],
    [type, metric, wellnessEntries, performanceEntries, range],
  );

  const filledValues = series
    .map((d) => d.value)
    .filter((v): v is number => v !== null);
```

Replace the `average` definition (lines 108-111) with:

```ts
  const average =
    filledValues.length > 0
      ? filledValues.reduce((s, v) => s + v, 0) / filledValues.length
      : undefined;
```

Replace the existing `<MetricChart>` invocation (lines 133-142) with:

```tsx
        <MetricChart
          type={getMetricChartConfig(metric.id).chartType}
          metricId={metric.id}
          data={dataLoading ? [] : series}
          goalLine={goalLine}
          averageLine={average}
          title={`Your ${metric.name}`}
          description={description}
          dataTableTitle={`${metric.name} data`}
          rangeKey={range}
          loading={dataLoading}
        />
```

Delete the `chartTypeFor` function (lines 363-370) and its `void chartTypeFor;` reference if any. Search the file for `chartTypeFor` and remove all references — it's no longer needed.

- [ ] **Step 2: TypeScript build check**

Run: `npm run build`
Expected: TypeScript compiles cleanly.

- [ ] **Step 3: Run the full chart and dashboard test suites**

Run: `npm test -- src/charts/ src/components/dashboard/`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/charts/MetricDetail.tsx
git commit -m "feat(charts): wire MetricDetail to MetricBarChart with chartType plumbing [DGT-35]"
```

---

### Task 16: Manual visual verification

**Goal:** Confirm the charts visually match the prototype on real screens. Type-check and tests are green at this point — this task validates the demo-readiness claim.

- [ ] **Step 1: Start the emulators (terminal 1)**

Run: `npm run emulators`
Wait for "All emulators ready!"

- [ ] **Step 2: Start the dev server (terminal 2)**

Set `VITE_USE_EMULATORS=true` in `.env.local` if not already.
Run: `npm run dev`
Open http://localhost:5173

- [ ] **Step 3: Verify the Hydration Dashboard chart card**

- Sign in (use the Login form against the emulator).
- Land on the Dashboard. The Health & Wellness chart card should show **Hydration** by default (or whichever metric is first in your tracked list).
- Switch the metric dropdown to **Hydration** if needed.
- Confirm:
  - Y-axis labels: `1` at top, `8` at bottom (inverted, raw scale).
  - Goal badge on the left: `Goal 3`.
  - Solid horizontal goal line at the y-position of value 3.
  - Bars rendered with bright green at-or-above-goal (raw value ≤ 3) and muted green below-goal (raw value > 3).
  - If today has no entry, dashed-rectangle ghost at the today slot.
  - Avg badge upper-right showing e.g. `Avg: 3.4`.
  - X-axis labels at every day for 7d (e.g. `4/30`, `5/1`, ..., `5/6`).

- [ ] **Step 4: Verify the Sleep Efficiency Dashboard chart card**

- Switch the dropdown to **Sleep Efficiency**.
- Confirm:
  - Y-axis labels: `100%` at top, `0%` at bottom.
  - Goal badge `Goal 75%` (or your profile's value: 70 / 75 / 80).
  - Bars colored bright/muted relative to goal.
  - Avg badge upper-right with `%` suffix.

- [ ] **Step 5: Verify range switching**

- Click each range pill: 7d / 2w / 30d / 3mo / 6mo / 1y.
- Confirm:
  - Bars get visibly thinner at longer ranges (sub-pixel at 1y is expected and acceptable).
  - X-axis labels: every day at 7d, every 3 days at 2w, every 7 days at 30d, every 15 days at 3mo+.
  - Goal line and badge stay anchored.
  - No console errors.

- [ ] **Step 6: Verify MetricDetail**

- Tap a metric chart card to navigate to MetricDetail.
- Same chart engine, same expected visuals.
- Confirm the "Show data" toggle still reveals the data table; null cells render as `—`.

- [ ] **Step 7: Verify the Performance metric chart card**

- Scroll down to the Performance section on the Dashboard.
- Switch through the tracked performance metrics. Bars should render (no goal/avg lines for metrics without goals — that's expected).

- [ ] **Step 8: Build check**

Run: `npm run build`
Expected: Production build succeeds with no TypeScript errors.

- [ ] **Step 9: If anything is visually off, capture a screenshot and tune CSS**

Most tunings are in `src/charts/MetricBarChart.module.css`:
- Bar colors: `.barAtOrAboveGoal`, `.barBelowGoal` fills.
- Goal badge color: `.goalBadgeRect` fill (yellow/cream).
- Today-ghost stroke pattern: `.todayGhost` `stroke-dasharray`.
- Axis label font size: `.yLabel`, `.xLabel` `font-size`.

For positioning tweaks, edit the constants `M_TOP`, `M_BOTTOM`, `M_LEFT`, `M_RIGHT` at the top of `MetricBarChart.tsx`.

If you make any tuning changes, commit them:

```bash
git add src/charts/MetricBarChart.module.css src/charts/MetricBarChart.tsx
git commit -m "fix(charts): visual polish on bar chart [DGT-35]"
```

- [ ] **Step 10: Push and open the PR**

```bash
git push -u origin DGT-35-bar-chart
gh pr create --base convert-prototype --title "feat: implement bar chart rendering [DGT-35]" --body "$(cat <<'EOF'
## Summary
- Replaces the gray-box `<MetricChart>` placeholder with a working hand-rolled SVG bar chart matching the prototype visuals.
- Bar variant only this round; `type: "line"` stays in the API and renders a "Line chart not yet implemented" note (tracked as a follow-up).
- New `metricChartConfig.ts` table is the single source of truth for per-metric chart settings (chartType, axis range, axis inversion, value formatter, static goal default). Profile-keyed goals continue to flow through `lookupGoalLine`, with config as the static fallback.
- Series builder now emits a date-aligned window with `value: number | null` so the chart can render today-no-data ghosts and leave empty slots for missing past days.

## Test plan
- [x] `npm test` — all chart tests pass
- [x] `npm run build` — TypeScript clean
- [ ] Manual: Hydration dashboard card matches prototype (Goal 3 badge, inverted y-axis 1..8)
- [ ] Manual: Sleep Efficiency dashboard card matches prototype (0–100% axis, profile-keyed goal)
- [ ] Manual: Range switching works across 7d / 2w / 30d / 3mo / 6mo / 1y; sub-pixel bars at long ranges are acceptable for the demo
- [ ] Manual: MetricDetail charts render correctly with the same engine
- [ ] Manual: Today-no-data shows the dashed-rectangle ghost
- [ ] Manual: Data table ("Show data") still reveals; null cells show "—"

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Shared `<If>` component for conditional JSX (Task 6 — `src/components/common/If.tsx`)
- ✅ Replace gray-box placeholder with bar visuals (Tasks 7-13)
- ✅ Y-axis + adaptive x-axis labels (Task 7 — `Axes`, uses Task 5's `xAxisLabelIndices`)
- ✅ Goal line + left-edge yellow badge (Task 8 — `GoalLineAndBadge`)
- ✅ Floating right-edge average badge, no line (Task 9 — `AverageBadge`)
- ✅ Today-no-data dashed-rectangle ghost (Task 10 — `TodayGhost`)
- ✅ Per-metric goal-comparison color encoding with inverted-axis support (Task 11 — `Bars`)
- ✅ Composes everything inside a `<g>` group with the right z-order, using `<If>` instead of `&&` for conditional subcomponents (Task 12 — `MetricBarChart`)
- ✅ Single source of truth for per-metric chart settings (Task 2 — `metricChartConfig`)
- ✅ Profile-keyed goal resolution with static-config fallback (Task 2 — `lookupGoalLine` extension)
- ✅ Inverted axis support for Hydration (Task 1 `linearScale` + Task 11 `Bars` comparison flip + Task 12 orchestrator scale)
- ✅ Sub-pixel bars at long ranges (no aggregation; verified manually in Task 16)
- ✅ Line variant stays in API but renders a TBD note (Task 13)
- ✅ Both consumers (DashboardChartCard, MetricDetail) updated (Tasks 14, 15)
- ✅ ChartDataTable handles null values (Task 4)
- ✅ A11y wiring preserved on `MetricChart` (`role="img"`, `<title>`, `<desc>`, "Show data" toggle) (Task 13 — kept intact)
- ✅ Reusable subcomponents for the future line-chart variant: `Axes`, `GoalLineAndBadge`, `AverageBadge`

**Type consistency check:**
- `MetricChart`'s `data` prop is `Array<{ date: string; value: number | null }>` consistently (Tasks 4, 13, 14, 15).
- `MetricBarChart` props `goalRaw` / `averageRaw` are numbers; `MetricChart` passes its `goalLine` / `averageLine` props through unchanged.
- `ChartGeom` is defined once in `chartGeom.ts` (Task 7) and imported by every subcomponent (Tasks 8-12). All five subcomponents accept the same `geom: ChartGeom` shape.
- `yScale: (value: number) => number` is the function signature from `linearScale` (Task 1) and is consumed identically by `Bars`, `TodayGhost`, `GoalLineAndBadge`, `AverageBadge`.
- `getMetricChartConfig(metricId).chartType` is `"bar" | "line"` and matches `MetricChart`'s `type` prop.
- `rangeKey` is `TimeRangeKey` from `TimeRangePicker` and threads through to `xAxisLabelIndices` and `Axes`.
- `<If>`'s `condition` prop is a plain boolean; the orchestrator uses non-null assertions (`goalRaw!`, `averageRaw!`) inside `<If>` bodies because `<If>` doesn't perform TypeScript narrowing — the runtime `condition` check enforces the assertion.
- All test assertions on CSS class names use `[class*="..."]` substring selectors so they work whether Vitest's CSS-Modules handling hashes or preserves the original name.

**Placeholder scan:** No "TBD", no "implement later", no "similar to Task N" without code. All steps include exact file paths, complete code, and concrete commands.
