# DGT-19 — Times should have minutes

**Jira:** [DGT-19](https://concord-consortium.atlassian.net/browse/DGT-19) (Epic DGT-21 MultiSport)
**Status:** Design approved, pending spec review
**Date:** 2026-07-01

## Problem

Athletes enter training data in the time formats they are used to. Today every
value in the app is stored and manipulated as a plain number; there is no notion
of a "time" anywhere in the pipeline. The input regex even rejects a `:`, so a
duration like `08:40` cannot be typed at all, and a stored `8.6667` redisplays as
`8.6667` rather than `8:40`.

This story adds in-app time entry, redisplay, chart formatting, and goal entry
for time-valued metrics — both built-in and user-defined custom metrics.

## Scope

**In scope**
- Multi-field time entry (hours/minutes/seconds) whose field set is per-metric.
- Redisplay of stored values in time format when returning to a page.
- Time formatting on the app's own charts (axis ticks, average badge, goal-line badge).
- Time-aware goal and y-axis inputs (built-in override form and custom-metric form).
- Custom (user-defined) metrics can be declared as time metrics.

**Out of scope (deferred to separate stories)**
- **CODAP export/integration.** How durations appear inside CODAP is deferred to
  its own story. CODAP continues to receive the numeric value as it does today.
  The ticket line "times shown in time format when opened in CODAP" is softened
  for this story to "shown with correct units, time-formatted in-app." A
  follow-up story will cover true in-CODAP time display. (CODAP has no native
  duration type; a numeric attribute does not natively render as `h:mm`, so this
  needs its own investigation.)

## Key decisions

### 1. Value model & per-metric config

The stored value stays a **single decimal number, in the largest displayed time
unit**. The multi-field UI is pure entry/display sugar. The governing rule:

> The largest field of a time metric *is* its stored unit and accepts decimal
> shorthand; smaller fields are just a finer way to enter/read the same number.

| Metric   | Format     | Stored unit     | `5:30` means    | decimal shorthand      |
|----------|------------|-----------------|-----------------|------------------------|
| Sleep    | `h:mm`     | decimal hours   | 5h 30m = 5.5    | `8.6` in hours field   |
| Mile run | `m:ss`     | decimal minutes | 5m 30s = 5.5    | `5.5` in minutes field |
| Marathon | `h:mm:ss`  | decimal hours   | —               | decimal hours          |
| Sprint   | `s`        | decimal seconds | 5.30 s          | (already decimal)      |

This matches existing built-in units (sleep `hr`, mile `min`, sprint `sec`), so
there is **no data migration** — existing values are reinterpreted identically.

**Config:** add one optional field to both `MetricDefinition` (`src/metrics/types.ts`)
and `CustomMetricDef` (`src/types/customMetrics.ts`):

```ts
timePrecision?: "h" | "m" | "s"   // finest field required; coarsest derived from the metric's unit
```

A time layout needs two boundaries — the coarsest field and the finest. The
**coarsest is already the metric's unit** (the stored unit from the table above),
so we only add the **finest** as `timePrecision`. The pair is unique across every
layout we support:

| coarsest (`unit`/`displayUnit`) | `timePrecision` | derived layout |
|---------------------------------|-----------------|----------------|
| `hr`                            | `m`             | `h:mm`         |
| `hr`                            | `s`             | `h:mm:ss`      |
| `min`                           | `s`             | `m:ss`         |
| `sec`                           | `s`             | `s`            |

The presence of `timePrecision` is the discriminator that makes a numeric metric
a "time" metric. It drives which fields render, the parse, the redisplay, and the
chart formatter. Absent → today's plain numeric behavior, untouched.

**Coarsest-unit derivation.** A small `normalizeTimeUnit(metric)` maps the metric's
unit to `"h" | "m" | "s"` — `hr`/`hour`/`h → h`, `min`/`m → m`, `sec`/`s → s` —
tolerating a rate suffix (`hr/night`) and preferring the cleaner `displayUnit`
(`"hr"`) over `unit` (`"hr/night"`). It returns `null` when a unit can't be
mapped; the only cost of deriving the coarsest from a display string rather than
an explicit enum. To keep this reliable for custom metrics, the custom-metric
form sets the unit to a canonical `hr`/`min`/`sec` when Format = Time (rather than
free-form), so a custom time metric always normalizes.

### 2. Parse/format utility

New `src/utils/timeValue.ts` — the single source of truth, consumed by input,
redisplay, goals, and charts. A `TimeLayout` (`{ coarsest, precision }`) is
resolved once per metric from its unit + `timePrecision`, and the parse/format
functions take that layout:

```ts
type TimeUnit = "h" | "m" | "s"
type TimeLayout = { coarsest: TimeUnit; precision: TimeUnit }   // coarsest ≥ precision

normalizeTimeUnit(metric): TimeUnit | null           // unit/displayUnit → h|m|s
resolveTimeLayout(metric): TimeLayout | null         // null when not a time metric / unit unmappable
parseTimeToDecimal(fields: { h?: string; m?: string; s?: string }, layout): number | null
formatDecimalToFields(value: number, layout): { h?: string; m?: string; s?: string }
formatDecimalToTime(value: number, layout): string   // "5:30", "1:23:45", "5.30"
```

Parsing rules:
- Each field is numeric-only, **except the largest field accepts a decimal** (the
  shorthand). E.g. `h:mm` sleep: hours field takes `8` or `8.6`; minutes field
  takes a `0–59` integer.
- If the largest field carries a decimal, smaller fields are disabled/ignored for
  that entry — you enter either `8.6` *or* `8` + `36`, never both. Prevents the
  `8.6` + `40min` ambiguity.
- A colon pasted into a field (`8:40`) is parsed and split across the fields, so
  `08:40` / `8:40` are valid entries per the ticket.
- Minutes/seconds clamp to `0–59` with inline validation using the existing
  field-error style.
- Unparseable/empty → returns `null` (no value), matching today's
  `Number()`→`NaN` drop path so no corrupt value is stored.

### 3. Input widget

New `src/components/logs/TimeInput.tsx` renders N sub-fields separated by `:`,
driven by the resolved `TimeLayout`. Wired into `MetricInputRow.tsx` as a new branch (new
entry in the `MetricInputRowProps` union). It uses its own per-field filtering
rather than `useNumericLocalString`, so the numeric path (whose regex rejects
`:`) is left untouched.

Redisplay: on load, `formatDecimalToFields(stored, layout)` seeds the sub-fields;
`8.6667` → `8` / `40`, not `8.6667`.

Storage write: `HealthLog.tsx` (`setNumericField` / `setCustomMetric`) and the
competition/performance logs parse via `parseTimeToDecimal` when the metric has a
`timePrecision`, storing the resulting decimal number.

### 4. Custom-metric UI

Time is a **sub-format of Numeric**, not a new top-level type, so the top-level
chooser (Numeric / Categorical / Y/N) is unchanged and the entire numeric save
path (`buildPayload` numeric branch, goal, y-axis, average) is reused.

When **Numeric** is selected, add a **Format** control. Since the layout is
`(unit, timePrecision)`, the author picks a canonical **Unit** (coarsest) and a
**Precision** (finest, ≤ unit):

```
Format:  ( ) Number   ( ) Time
         └ when Time:  Unit: [ hr ▼ ] ( hr | min | sec )   Precision: [ min ▼ ] ( ≤ Unit )
```

When Format = Time:
- The **Unit** control replaces the free-form unit input with a canonical
  `hr`/`min`/`sec` select, so the metric always `normalizeTimeUnit`s. **Precision**
  is constrained to units ≤ Unit (`hr` → `min`/`sec`; `min` → `sec`; `sec` → `sec`).
- **Goal** and **Y-axis top/bottom** render as `TimeInput`s.
- The **Decimals** field is greyed (like Y/N today) — a time average formats via
  `formatDecimalToTime`, not a decimal count. Precision `s` (seconds-only, i.e.
  Unit = `sec`) is the exception: it keeps Decimals for sub-second precision.
- `CustomMetricDef` gains `timePrecision?`; `buildPayload` sets it and the
  canonical `unit`.
- Edit-confirmation guard: changing `timePrecision` or the (canonical) `unit`
  (like changing unit/inputType today) prompts when entries exist, since it
  reinterprets stored numbers.

`customDefToChartConfig` resolves the `TimeLayout` from `timePrecision` + unit the
same way built-ins do, so custom time metrics chart correctly with no extra branch.

### 5. Built-in goals, y-axis & charts

**Charts** (`src/charts/metricChartConfig.ts`): for a metric with `timePrecision`,
`formatValue` becomes a time formatter built from the resolved `TimeLayout`
(replacing `fmtRaw`). Everything downstream funnels through `formatValue` —
`chartSeries.formatMetricValue`, `Axes` y-labels, `AverageBadge`,
`GoalLineAndBadge` — so axis ticks, average, and goal-line badge all render as
`5:30` / `1:23:45` with no per-consumer changes.

- The time formatter ignores `toFixed`/`avgDecimals` and formats the decimal mean
  directly via `formatDecimalToTime`. Averaging still happens on the decimal
  values (correct — they are decimals in one unit).
- No auto-inversion for "lower is better" time metrics; the axis stays ascending
  with the goal line low. Time formatting is orthogonal to axis direction.

**Built-in goals** (`src/components/tracking/MetricOverrideForm.tsx`): `goalRaw`,
`yTopRaw`, `yBottomRaw` render as `TimeInput`s when the metric has `timePrecision`,
parsed via the util (replacing the `Number()`-only path). Storage stays `number`.
The recommended-goal *copy* in `src/data/metricGoals.ts` stays plain text.

All four layouts are first-class, including **`h:mm:ss`** — long-distance events
(marathon, half-marathon) require hours+minutes+seconds and are supported via
unit `hr` + `timePrecision` `s`.

**Initial built-in `timePrecision` assignments** (refine during planning). The
coarsest comes from the existing unit, so only `timePrecision` is added; where an
event needs hours the unit is `hr`:

| Metric                            | unit (coarsest) | `timePrecision` | layout     |
|-----------------------------------|-----------------|-----------------|------------|
| `sleepTime`                       | `hr`            | `m`             | `h:mm`     |
| `oneMileRun`                      | `min`           | `s`             | `m:ss`     |
| competition `times` (short events)| `min`           | `s`             | `m:ss`     |
| marathon / half-marathon          | `hr`            | `s`             | `h:mm:ss`  |
| `tenMeterSprint`, `fortyYardDash` | `sec`           | `s`             | `s`        |

(How the competition-event metrics are modeled — a single generic `times` vs.
per-event metrics carrying their own unit/precision — is settled during planning;
the layout system supports all of the above regardless.)

## Affected files

- `src/utils/timeValue.ts` — **new** parse/format util.
- `src/components/logs/TimeInput.tsx` — **new** multi-field time input.
- `src/metrics/types.ts` — add `timePrecision?` to `MetricDefinition`.
- `src/metrics/healthMetrics.ts`, `competitionMetrics.ts`, `addableMetrics.ts` —
  set `timePrecision` on time metrics.
- `src/components/logs/MetricInputRow.tsx` — new time branch + props variant.
- `src/components/logs/HealthLog.tsx` (and competition/performance logs) —
  parse/redisplay via the util.
- `src/types/customMetrics.ts` — add `timePrecision?` to `CustomMetricDef`.
- `src/components/tracking/CustomMetricForm.tsx` — Format control (canonical unit
  + precision), time goal/y-axis, edit-confirm on `timePrecision`/unit change.
- `src/metrics/customMetricDefinition.ts` — carry `timePrecision` through the adapter.
- `src/components/tracking/MetricOverrideForm.tsx` — time-aware goal/y-axis inputs.
- `src/charts/metricChartConfig.ts` — time `formatValue`; custom time formatter.

## Error handling

Reuses existing field-error patterns; no corrupt writes.
- Minutes/seconds outside `0–59` → inline field error; nothing stored.
- Largest-field decimal present → smaller fields disabled with a hint.
- Colon pasted into a field → parsed and split across fields.
- Unparseable/empty → treated as no-value (matches today's `NaN` drop path).

## Testing

- `timeValue` util — `normalizeTimeUnit`/`resolveTimeLayout` (including the
  `hr/night` suffix and the unmappable→`null` case); parse/format round-trips
  across all four layouts; decimal shorthand; colon paste; `0`/`59` boundaries;
  empty; unparseable.
- `TimeInput` component; `MetricInputRow` time branch; redisplay (stored decimal
  → seeded fields).
- `CustomMetricForm` — Time sub-format, canonical unit + precision, time
  goal/y-axis, edit-confirm on `timePrecision`/unit change.
- `MetricOverrideForm` — time goal/y-axis parse round-trip.
- Chart config — `formatValue` emits time strings; average formats as time.
- Verify with `npm run build` / `tsc -b` (build mode, not `--noEmit`); eyeball
  input + chart in the dev server against the prototype before committing.

## Follow-up

- **CODAP time export** (new story): true in-CODAP time display for duration
  attributes, once CODAP's capability is confirmed.
