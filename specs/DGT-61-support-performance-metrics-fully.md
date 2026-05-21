# DGT-61 — Support performance metrics fully

**Status:** Design approved, ready for implementation plan
**Jira:** [DGT-61](https://concord-consortium.atlassian.net/browse/DGT-61)
**Story points:** 3
**Sprint:** FY26 Sprint 17
**Follow-up to:** DGT-36 (custom metrics) + DGT-48 (metric overrides)

## Problem

Performance metrics are a second-class metric type today:

1. **Custom performance metric authoring is not supported.**
   - `CustomMetricForm.isAuthorableType` narrows the route to `"health" | "competition"`.
   - `AddMetric` redirects `/add-metric/performance` back to `/setup/tracking`.
   - The "🚧 Add Performance Metric" button on the tracking-setup screen is rendered as a disabled affordance via `TrackedDataSetup`'s `addToComingSoon` prop.
2. **Built-in performance metric goal/axis editing is not supported.**
   - DGT-48 added per-user overrides for health + competition built-ins, but had to suppress the edit pencil on performance rows (`SortableMetricRow`'s `type !== "performance"` gate) because the override route dead-ended.
   - The `CustomMetricForm` gateway that routes built-in metric ids into `MetricOverrideForm` only knows about health and competition registries.

## Goal

Bring performance metrics to parity:

1. Enable authoring of custom performance metrics — same Numeric / Categorical / Y/N options as health and competition.
2. Support editing of built-in performance metrics via the existing override flow.
3. Author per-metric chart configs for the 19 built-in performance metrics so the override form's y-axis placeholders, and the charts themselves, render with sensible bounds instead of the 0–100 `DEFAULT_CONFIG` fallback.

## Out of scope

- **Per-profile recommended perf goals.** The DGT-51 spreadsheet has no per-profile goal data for any of the 19 perf metrics and explicitly marks all of them as "user sets their own goal." The override form will show a generic hint instead of a recommendation.
- **Pace-style formatters** (rendering 4.5 min as "4:30"). Charts will continue to use `fmtRaw`.
- **Unit picker for ambiguous-unit metrics** (kg/lbs, m/s/mph). We pick a canonical unit per metric for the chart config; user-stored values remain unit-agnostic raw numbers.

## Design

### 1. Authoring gates

Four small surface flips, no new abstractions:

| File | Change |
|---|---|
| `src/components/tracking/CustomMetricForm.tsx` | Drop the `AuthorableCustomMetricType` narrowing. `isAuthorableType` accepts all three of `health` / `performance` / `competition`. Delete the "Authoring is not yet implemented for performance" comment block (lines 25–27). (The body's auto-track switch is covered in Section 5.) |
| `src/components/tracking/AddMetric.tsx` | Line 22 guard widens to accept `"performance"`. Delete the `TODO(DGT-51 follow-up)` comment block (lines 16–21). |
| `src/components/tracking/TrackedDataSetup.tsx` | Drop 🚧 from the perf section's `addToLabel` ("Add Performance Metric") and remove the `addToComingSoon` prop. |
| `src/components/tracking/TrackedMetricsTable.tsx` | Remove the now-unused `addToComingSoon` prop entirely (YAGNI). |

### 2. Override path

| File | Change |
|---|---|
| `src/components/tracking/SortableMetricRow.tsx` | Line 98: drop the `type !== "performance"` clause from the `<If>` condition — built-in perf rows now show the edit pencil for tracked metrics. Delete the perf-suppression rationale comment (lines 91–97). |
| `src/components/tracking/CustomMetricForm.tsx` | The built-in lookup (lines 222–229) — currently a ternary over health vs. competition — becomes a switch covering `"performance"` → `[...PERFORMANCE_METRICS, ...ADDABLE_PERFORMANCE]`. Routes to the same `MetricOverrideForm`. |

`MetricOverrideForm` itself needs no changes — it is already generic over `MetricDefinition`.

### 3. Per-perf CONFIG entries

**Location:** `src/charts/metricChartConfig.ts`, alongside existing `competitionConfig` / `HYDRATION` / `LEAN_MASS` / etc. Do NOT inline configs into `performanceMetrics.ts` / `addableMetrics.ts` — registry metadata stays in the metric def files; chart bounds + formatters stay in `metricChartConfig.ts`.

**Helper:** mirror `competitionConfig(yBottom, yTop, unit?)`:

```ts
function performanceConfig(
  yBottom: number,
  yTop: number,
  unit?: string,
): MetricChartConfig
```

Same shape: `chartType: "bar"`, `randomFloat` random over `[yBottom, yTop]`, `fmtRaw` formatter, optional separable `unit` string. No inversion logic — see "Axis direction" below.

**Provenance convention.** Add a comment block above the perf entries explaining the two sources:
- **from sheet**: yBottom/yTop derived from the DGT-51 spreadsheet's "Estimated Range (Physiological)" column.
- **guesstimate**: no sheet value; bounds picked during DGT-61. The content team should confirm or revise.

Per-row trailing comment makes the 13 "guesstimate" rows scannable at a glance. The PR description surfaces this as an explicit "for content review" callout.

**Bounds:**

| Metric | yBottom → yTop | Unit | Source |
|---|---|---|---|
| oneRepMaxBench | 0 → 250 | kg | guesstimate |
| oneRepMaxDeadlift | 0 → 300 | kg | guesstimate |
| oneRepMaxHangClean | 0 → 200 | kg | guesstimate |
| oneRepMaxPowerClean | 0 → 200 | kg | guesstimate |
| oneRepMaxSquat | 0 → 300 | kg | guesstimate |
| oneMileRun | 4 → 15 | min | from sheet |
| tenMeterSprint | 1 → 3 | sec | from sheet |
| fortyYardDash | 4.2 → 10 | sec | from sheet |
| averageVelocity | 0 → 15 | m/s | guesstimate |
| beepTest | 1 → 21 | levels | from sheet |
| deceleration | 0 → 15 | m/s | guesstimate |
| distance | 0 → 20 | mi | guesstimate |
| forwardAcceleration | 0 → 15 | m/s | guesstimate |
| heartRateZone | 50 → 200 | bpm | guesstimate |
| peakVelocity | 0 → 15 | m/s | guesstimate |
| reactiveStrengthIndex | 0 → 5 | (none) | guesstimate |
| standingBroadJump | 100 → 350 | cm | from sheet |
| upwardAcceleration | 0 → 15 | m/s | guesstimate |
| verticalJump | 1 → 50 | in | from sheet |

**Axis direction.** All 19 perf metrics author with normal ascending axes (`yBottom < yTop`). Time-based metrics (`oneMileRun`, `tenMeterSprint`, `fortyYardDash`) keep their goal line *low* on the chart — bars get shorter as the athlete improves, which matches an athlete's mental model. No per-metric inversion plumbing. The override form's existing `baseAscending` check ends up "always ascending" for perf, which is correct.

**Unit ambiguity.** Five metrics carry "kg or lbs" / "m/s or mph" / "m or mi" / "in or cm" in their `MetricDefinition.unit` string. We pick one canonical unit per metric for the CONFIG (table above — kg-leaning for masses, m/s for velocities, cm for jumps, mi for distance). This affects the chart's tooltip label only; the user's stored values remain unit-agnostic raw numbers. A small behavioral change for any user who has been entering values in the "other" unit — call it out in the PR description.

### 4. Goal-text hint

In `src/data/metricGoals.ts`, the `PERFORMANCE_IDS` branch (lines 89–94) changes its returned string:

```diff
- return "🚧 Personalized goal coming soon";
+ return "Performance goals are personal — enter your target.";
```

Replace the "Per-gender × athlete-type goals for Performance metrics are defined in the DGT-51 design source but not yet wired through" comment with a one-liner explaining the sheet's stance: perf is user-set, no canonical defaults.

The override form already renders the result of `resolveGoalText(metric.id, profileKey)` as `Recommended goal: {goalText}.` — no form-side change needed.

### 5. Auto-track on creation

`CustomMetricFormBody.handleSubmit` currently auto-appends the newly-created metric to either `trackedHealthMetrics` or `trackedCompetitionMetrics` based on `type === "health"`. Extend to a three-way switch covering `trackedPerformanceMetrics` and the empty `PERFORMANCE_METRICS` default. Matches existing behavior for the other two types.

### 6. Tests

File-by-file edits, no new test files:

| File | Change |
|---|---|
| `CustomMetricForm.test.tsx` | Add a perf-authoring smoke (covers the gate change + auto-track switch case for `trackedPerformanceMetrics`) |
| `MetricOverrideForm.test.tsx` | Add a perf-metric override test (covers gateway routing + y-axis placeholder pulled from the new CONFIG entry) |
| `AddMetric.test.tsx` | Flip the existing "performance redirects" assertion to "performance renders the list" |
| `TrackedDataSetup.test.tsx` | Remove the "🚧 Add Performance Metric is disabled" assertion; replace with "linked, not disabled" |
| `SortableMetricRow.test.tsx` | Remove the "perf rows suppress edit pencil" assertion; add positive case |
| `metricChartConfig.test.ts` | Spot-check that perf metrics resolve to real (non-`DEFAULT_CONFIG`) bounds |

The goal-hint text change is covered transitively by the `MetricOverrideForm.test.tsx` perf case.

### 7. Risk / migration

None. No Firestore schema changes — overrides are already metric-id-keyed and metric-type-agnostic. No data backfill. PR sits fully behind existing auth/routing; existing users with no override docs see unchanged charts. The unit canonicalization (Section 3, "Unit ambiguity") is a tooltip-label-only change.

## Rollout

Single bundled PR (multiple focused commits inside). Matches the DGT-48 PR pattern.

Suggested commit boundaries inside the PR:
1. CONFIG entries + helper in `metricChartConfig.ts` (data only, no behavior change yet)
2. Open the authoring gates (`CustomMetricForm`, `AddMetric`, `TrackedDataSetup`, `TrackedMetricsTable`) + auto-track switch + tests
3. Open the override gates (`SortableMetricRow`, `CustomMetricForm` gateway) + tests
4. Goal-text hint update in `metricGoals.ts` + comment cleanups

Reviewer: Doug Martin (Developer Approver).
