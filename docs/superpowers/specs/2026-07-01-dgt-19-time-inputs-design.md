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
timeFormat?: "h:mm" | "m:ss" | "h:mm:ss" | "s"
```

The presence of `timeFormat` is the discriminator that makes a numeric metric a
"time" metric. It drives which fields render, the parse, the redisplay, and the
chart formatter. Absent → today's plain numeric behavior, untouched.

### 2. Parse/format utility

New `src/utils/timeValue.ts` — the single source of truth, consumed by input,
redisplay, goals, and charts:

```ts
parseTimeToDecimal(fields: { h?: string; m?: string; s?: string }, format): number | null
formatDecimalToFields(value: number, format): { h?: string; m?: string; s?: string }
formatDecimalToTime(value: number, format): string   // "5:30", "1:23:45", "5.30"
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
driven by `timeFormat`. Wired into `MetricInputRow.tsx` as a new branch (new
entry in the `MetricInputRowProps` union). It uses its own per-field filtering
rather than `useNumericLocalString`, so the numeric path (whose regex rejects
`:`) is left untouched.

Redisplay: on load, `formatDecimalToFields(stored, format)` seeds the sub-fields;
`8.6667` → `8` / `40`, not `8.6667`.

Storage write: `HealthLog.tsx` (`setNumericField` / `setCustomMetric`) and the
competition/performance logs parse via `parseTimeToDecimal` when the metric has a
`timeFormat`, storing the resulting decimal number.

### 4. Custom-metric UI

Time is a **sub-format of Numeric**, not a new top-level type, so the top-level
chooser (Numeric / Categorical / Y/N) is unchanged and the entire numeric save
path (`buildPayload` numeric branch, goal, y-axis, average) is reused.

When **Numeric** is selected, add a **Format** control:

```
Format:  ( ) Number   ( ) Time
         └ when Time:  Granularity: [ h:mm ▼ ]   ( h:mm | m:ss | h:mm:ss | s )
```

When Format = Time:
- The free-form **Unit** input is hidden and auto-derived from granularity
  (`h:mm`/`h:mm:ss` → `hr`, `m:ss` → `min`, `s` → `sec`).
- **Goal** and **Y-axis top/bottom** render as `TimeInput`s.
- The **Decimals** field is greyed (like Y/N today) — a time average formats via
  `formatDecimalToTime`, not a decimal count. Seconds-only (`s`) is the
  exception: it keeps Decimals for sub-second precision.
- `CustomMetricDef` gains `timeFormat?`; `buildPayload` sets it and derives `unit`.
- Edit-confirmation guard: changing `timeFormat` (like changing unit/inputType)
  prompts when entries exist, since it reinterprets stored numbers.

`customDefToChartConfig` reads the time formatter from `timeFormat` the same way
built-ins do, so custom time metrics chart correctly with no extra branch.

### 5. Built-in goals, y-axis & charts

**Charts** (`src/charts/metricChartConfig.ts`): for a metric with `timeFormat`,
`formatValue` becomes a time formatter built from that format (replacing
`fmtRaw`). Everything downstream funnels through `formatValue` —
`chartSeries.formatMetricValue`, `Axes` y-labels, `AverageBadge`,
`GoalLineAndBadge` — so axis ticks, average, and goal-line badge all render as
`5:30` / `1:23:45` with no per-consumer changes.

- The time formatter ignores `toFixed`/`avgDecimals` and formats the decimal mean
  directly via `formatDecimalToTime`. Averaging still happens on the decimal
  values (correct — they are decimals in one unit).
- No auto-inversion for "lower is better" time metrics; the axis stays ascending
  with the goal line low. Time formatting is orthogonal to axis direction.

**Built-in goals** (`src/components/tracking/MetricOverrideForm.tsx`): `goalRaw`,
`yTopRaw`, `yBottomRaw` render as `TimeInput`s when the metric has `timeFormat`,
parsed via the util (replacing the `Number()`-only path). Storage stays `number`.
The recommended-goal *copy* in `src/data/metricGoals.ts` stays plain text.

**Initial built-in `timeFormat` assignments** (refine during planning):

| Metric                            | format    |
|-----------------------------------|-----------|
| `sleepTime`                       | `h:mm`    |
| `oneMileRun`                      | `m:ss`    |
| competition `times`               | `m:ss` (revisit if marathon-class events need `h:mm:ss`) |
| `tenMeterSprint`, `fortyYardDash` | `s`       |

## Affected files

- `src/utils/timeValue.ts` — **new** parse/format util.
- `src/components/logs/TimeInput.tsx` — **new** multi-field time input.
- `src/metrics/types.ts` — add `timeFormat?` to `MetricDefinition`.
- `src/metrics/healthMetrics.ts`, `competitionMetrics.ts`, `addableMetrics.ts` —
  set `timeFormat` on time metrics.
- `src/components/logs/MetricInputRow.tsx` — new time branch + props variant.
- `src/components/logs/HealthLog.tsx` (and competition/performance logs) —
  parse/redisplay via the util.
- `src/types/customMetrics.ts` — add `timeFormat?` to `CustomMetricDef`.
- `src/components/tracking/CustomMetricForm.tsx` — Format control, derived unit,
  time goal/y-axis, edit-confirm on `timeFormat` change.
- `src/metrics/customMetricDefinition.ts` — carry `timeFormat` through the adapter.
- `src/components/tracking/MetricOverrideForm.tsx` — time-aware goal/y-axis inputs.
- `src/charts/metricChartConfig.ts` — time `formatValue`; custom time formatter.

## Error handling

Reuses existing field-error patterns; no corrupt writes.
- Minutes/seconds outside `0–59` → inline field error; nothing stored.
- Largest-field decimal present → smaller fields disabled with a hint.
- Colon pasted into a field → parsed and split across fields.
- Unparseable/empty → treated as no-value (matches today's `NaN` drop path).

## Testing

- `timeValue` util — parse/format round-trips across all four formats; decimal
  shorthand; colon paste; `0`/`59` boundaries; empty; unparseable.
- `TimeInput` component; `MetricInputRow` time branch; redisplay (stored decimal
  → seeded fields).
- `CustomMetricForm` — Time sub-format, derived unit, time goal/y-axis,
  edit-confirm on `timeFormat` change.
- `MetricOverrideForm` — time goal/y-axis parse round-trip.
- Chart config — `formatValue` emits time strings; average formats as time.
- Verify with `npm run build` / `tsc -b` (build mode, not `--noEmit`); eyeball
  input + chart in the dev server against the prototype before committing.

## Follow-up

- **CODAP time export** (new story): true in-CODAP time display for duration
  attributes, once CODAP's capability is confirmed.
