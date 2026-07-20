# DGT-85 — Unify the two log-row components (design)

Bullet 2 of DGT-85, building directly on the metric-value accessor (bullet 1, shipped on this branch). DGT-80 left two separate row dispatchers - `HealthMetricRow` and `PerfCompMetricRow` - and the accessor work made both storage-agnostic (they read via `getMetricValue`, write via the writer). This spec merges them into **one row dispatcher** that renders every metric type through the shared `MetricInputRow` body.

## Scope

**In scope (bullet 2):**

- One dispatcher (`LogMetricRow`) replacing `HealthMetricRow` + `PerfCompMetricRow`, rendering `MetricInputRow` for all three metric types.
- Unify the numeric input onto `NumericInput` (unit suffix + hint) for every type, per the prototype - perf/comp numeric rows move off `CompetitionMetricInput`. This is the one intentional visual change.

**Deferred / out of scope:**

- **Bullet 3 - first-column "Summary" semantics** (unified average vs. Competition running total / win-rate vs. Performance latest). Blocked on a product/design call from Leslie. This spec **preserves today's per-type first cell exactly** and revisits the semantics after the merge lands.
- Storage migration (DGT-86); per-row sparkbars (DGT-69).

## Background: what is already shared vs. what differs

After the accessor work, the two row families already share the value read/write path and most widgets. Confirmed by inspection:

| Concern | Health (`MetricInputRow`) | Perf/Comp (`PerfCompMetricRow` `RecordCell`) | Status |
|---|---|---|---|
| `<tr>` skeleton, 3 columns, CSS | `.metricInputRow` / `.trackCell` / `.metricName` | `.row` / `.colSummary` / `.colMetric` / `.colRecord` | Near-identical (perf/comp CSS was matched to health's `10px 6px`) |
| Ordinal widget | `ScaleCards` | `ScaleCards` | **Shared** |
| Radio widget | `LevelRadioGroup` | `LevelRadioGroup` | **Shared** |
| Time widget | `TimeInput` | `TimeInput` | **Shared** |
| Numeric widget | `NumericInput` (unit + hint, ~194px) | `CompetitionMetricInput` (bare 60px centered) | **Differs - unify onto `NumericInput`** |
| First cell | sparkline + `avgLabel ?? "—"` | plain `summaryCell` string | **Differs - preserve both (bullet 3)** |
| Health-only widgets | hydration colorScale (synthetic `ScaleCards`), availability `tree` (`AvailabilityTree`), `relativeProteinIntake` placeholder | none | **Keep special-cased on identity** |

The ordinal-vs-radio routing already uses the same two components; the only difference is *where the decision is made* - `HealthMetricRow` picks `inputType` for its caller, while `RecordCell` inlines the `isYesNoLevels` check and forces built-in ordinals to `ScaleCards`. The merge unifies that decision into one place.

## Target architecture: dispatcher + shared body

`MetricInputRow` already renders every widget the merged row needs (numeric, colorScale, tree, ordinal, radio) and owns the `<tr>` markup. So the merge needs **one dispatcher**, not a new row body.

- **`LogMetricRow`** becomes the single dispatcher. It computes the `MetricInputRow` `inputType` and props from `tracked` + the accessor, for all three types, and renders `<MetricInputRow>`.
- **`MetricInputRow`** stays as the shared row body (a clean `inputType`-discriminated renderer), gaining one `placeholder` variant (below).
- **Delete** `HealthMetricRow`, `PerfCompMetricRow` (and its inner `RecordCell`).

Rejected alternatives: (B) one monolithic `LogRow` absorbing `MetricInputRow` too - bigger rewrite, discards the union renderer; (C) `MetricInputRow` takes `tracked` and self-dispatches - fewer files but mixes props-computation into the widget renderer.

### The unified dispatch branch order

In `LogMetricRow`, computed from `tracked` (preserving both DGT-80 landmines):

1. `!metricRendersRow(tracked)` -> `null`. (Already present; nominal customs render nothing in any type.)
2. **Health-only, keyed on `tracked.id`:**
   - `hydration` -> `inputType="colorScale"`.
   - `availability` -> `inputType="tree"` (passes `competitionTerm`).
   - `relativeProteinIntake` -> `inputType="placeholder"`.
3. **Built-in ordinal** (`builtInDef.inputType === "ordinal" && builtInDef.levels`) -> `inputType="ordinal"` (always `ScaleCards`; never radio). **Landmine 1.**
4. **Custom ordinal** (`customDef.primitive === "ordinal" && customDef.levels`) -> `inputType={isYesNoLevels(levels) ? "radio" : "ordinal"}`. **Landmine 2.**
5. **Else** -> `inputType="numeric"` (`MetricInputRow` internally routes to `TimeInput` when the metric has a time layout, else `NumericInput`).

Value comes from `getMetricValue(tracked, entry)`; scalar writes go through the `writeValue`/`setMetricValue` path already wired in. Availability keeps its tree `onChange -> setEntry({ availability })` bypass (non-scalar), unchanged.

The health-vs-map `entry` selection stays in `LogMetricRow` (it already receives all three entries). The `builtInDef` vs `customDef` metric passed to `MetricInputRow` is either the built-in `MetricDefinition` or `adaptCustom(customDef, type)` (below).

## Numeric unification

Perf/comp numeric rows move from `CompetitionMetricInput` (via `LogRecordInput`) to `NumericInput`, gaining the unit suffix + hint + width, matching the prototype and the post-migration target. Consequences, each handled:

1. **Reuse the existing `customAsMetricDefinition(def, type)`.** `src/metrics/customMetricDefinition.ts` already exports a type-parameterized adapter (used by `MetricDetail` and `TrackedDataSetup`, and by `LogRecordInput` today) that produces the `MetricDefinition` shape `NumericInput` / `ScaleCards` expect. The merged dispatcher calls it for custom metrics of any type; `HealthMetricRow`'s local `adaptCustom` (which hard-codes `type: "health"`) is deleted with the component. No new adapter file. (The widgets dispatch on the row's `inputType` union tag, not `metric.inputType`, so the adapter's `inputType` value is irrelevant to rendering.)
2. **`data-metric-id` on `NumericInput`.** Perf/comp row tests locate the input via `[data-metric-id="..."]`, which only `CompetitionMetricInput` stamps. Add `data-metric-id={metric.id}` to `NumericInput`'s `<input>` so the hook survives (and health rows become queryable the same way). Cheap, avoids rewriting every query.
3. **Relocate the two time helpers, then delete two components.** `LogRecordInput.tsx` exports `isTimeMetric` (used by `MetricsDataEntryLog`) and `timeSecondsDecimals` (used by `MetricInputRow`) alongside the `LogRecordInput` component (used only by the doomed `PerfCompMetricRow`). Move `isTimeMetric` + `timeSecondsDecimals` into a small module (`src/components/logs/timeMetrics.ts`), repoint the two importers, then **delete** `LogRecordInput.tsx` and `CompetitionMetricInput.tsx` (the latter is imported only by `LogRecordInput`).

**Verify in the running app:** perf/comp *time* metrics must still render `TimeInput` through `MetricInputRow`'s `resolveTimeLayout` (id-based, so expected to work) and perf/comp numeric metrics must show sensible unit suffixes.

## First cell (bullet 3 deferred)

No structural change. `MetricInputRow`'s cell 1 already renders `[optional sparkline] + [avgLabel ?? "—"]`. The dispatcher reproduces today's two looks by what it feeds:

- **Health:** pass the `HealthSummary` spread (`sparklineData`, `sparklineGoal`, `avgLabel`) - sparkline + average, exactly as now.
- **Perf/comp:** pass `avgLabel={summaryCell}` and **no** `sparklineData` -> renders just the string. Empty `summaryCell` is `""`, and `"" ?? "—"` is `""`, so an empty perf/comp summary stays blank (today's behavior), while health's undefined `avgLabel` still shows `—`.

The per-type first-cell content therefore stays byte-for-byte until bullet 3 revisits it.

## Health-only widgets

Stay special-cased on metric identity in the dispatcher (as the ticket requires):

- **hydration** -> `colorScale` (synthetic `ScaleCards`, `1..metric.max`), health-only.
- **availability** -> `tree` (`AvailabilityTree`), health-only.
- **`relativeProteinIntake`** -> a new `placeholder` `inputType` on `MetricInputRow`, so the placeholder row markup lives with all the other row markup instead of being hand-built in a deleted component. Renders the same `🚧 Auto-calculated · coming soon` cell.

## Files

| File | Change |
|---|---|
| `src/components/logs/LogMetricRow.tsx` | Becomes the unified dispatcher (widget selection for all types); renders `MetricInputRow`. |
| `src/components/logs/MetricInputRow.tsx` | Add `placeholder` variant; repoint `timeSecondsDecimals` import. No change to existing widget branches. |
| `src/components/logs/NumericInput.tsx` | Add `data-metric-id={metric.id}` on the input. |
| `src/components/logs/timeMetrics.ts` | New: `isTimeMetric`, `timeSecondsDecimals` (moved from `LogRecordInput`). |
| `src/metrics/customMetricDefinition.ts` | Reused as-is (the type-parameterized custom->MetricDefinition adapter); `HealthMetricRow`'s local `adaptCustom` is deleted with the component. |
| `src/components/logs/MetricsDataEntryLog.tsx` | Repoint `isTimeMetric` import to `timeMetrics`. No other change. |
| `src/components/logs/HealthMetricRow.tsx` | **Delete.** |
| `src/components/logs/PerfCompMetricRow.tsx` | **Delete** (incl. `RecordCell`). |
| `src/components/logs/LogRecordInput.tsx` | **Delete** (after helper relocation). |
| `src/components/logs/CompetitionMetricInput.tsx` | **Delete** (only `LogRecordInput` used it). |

CSS modules for deleted components (`PerfCompMetricRow.module.css`, any `LogRecordInput`/`CompetitionMetricInput` module) are removed; `MetricInputRow.module.css` is the surviving row stylesheet (it already carries `.placeholderCell`).

## Testing

- **Migrate the existing per-family tests onto `LogMetricRow`.** `HealthMetricRow.test.tsx` and `PerfCompMetricRow.test.tsx` cases become `LogMetricRow.test.tsx` cases covering, per type: numeric read/write (now `NumericInput` everywhere, queried via `data-metric-id`), the ordinal landmines (built-in -> `ScaleCards`; custom Yes/No -> `LevelRadioGroup`; custom scale -> `ScaleCards`), the nominal short-circuit, the health-only widgets (hydration colorScale, availability tree, placeholder), and the per-type first cell (sparkline+avg for health, plain string for perf/comp).
- **Parity focus:** a competition numeric row now renders `NumericInput` with its unit suffix; a performance metric reads `performanceEntry` not `competitionEntry` (keep the crossed-wire guard test); competition `summaryCell` (running total) still shows in cell 1.
- Full suite (`npm test`) + production build (`npm run build`).
- **Manual smoke** in the running app: every widget type per metric type, unit suffixes on perf/comp numeric, perf/comp time metrics still render `TimeInput`, availability tree, the day chip, and section counts.

## Migration note

This merge is a prerequisite the DB-storage migration (DGT-86) wants anyway: one row component reading through the accessor, with the numeric input already in its post-migration form. When storage unifies, the dispatcher's health-vs-map `entry` selection and the `adaptCustom` type parameter are the only per-type seams left, and both collapse.
