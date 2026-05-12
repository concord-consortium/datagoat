# DGT-50 — Non-numeric custom metric types: schema design

**Story:** [DGT-50](https://concord-consortium.atlassian.net/browse/DGT-50) — Non-numeric custom metric types (color, Y/N).
**Companion doc:** [`primitive-metric-typing.md`](primitive-metric-typing.md) captures the broader three-primitive model. This spec scopes what ships for the partner demo on or about 2026-05-12.

## Demo intent

Direction-of-travel. Partners should walk away believing custom metrics will support more than numbers, and should see the schema and creation form that points the way. End-to-end logging and charting works for a subset (Y/N and user-defined ordinals via the categorical table). Heavier pieces (color-swatch input row, label-tick chart axis, median aggregation, nominal-primitive UI) are explicitly deferred.

## Scope summary

In:
- New `primitive` discriminator on `CustomMetricDef`: `"numeric" | "ordinal" | "nominal"`.
- New `levels` field on `CustomMetricDef` for categorical metrics: `Array<{ label, value?, color? }>`.
- Existing numeric-only fields (`unit`, `goalRaw`, `yTopRaw`, `yBottomRaw`, `avgDecimals`) become optional and are omitted for non-numeric metrics.
- Form gains a three-button top-level type chooser (Numeric / Categorical / Y/N) and a levels table editor for Categorical.
- Log input row for ordinal customs renders as a horizontal radio group keyed off `levels`.
- Charts for ordinal customs work via save-time derivation of `yTopRaw`/`yBottomRaw` from levels — chart engine itself untouched.

Out (deferred):
- Nominal-primitive UI (creation, input, chart). Schema reserves the value; the form does not let users create one.
- Color-swatch log input (the hydration-style colorScale UI for customs). Schema lets the user attach `color` to levels, but the log row still renders as radio buttons.
- Label-tick chart axis (showing "Disagree / Neutral / Agree" on the y-axis instead of `2 / 3 / 4`).
- Median aggregation for ordinals; mean is used for v1.
- Likert / forced-choice / other preset templates.
- Built-in metric migration. Built-ins keep their hardcoded `inputType` config.

## Migration

None. Internal-dev DB is cleared before the demo, so `primitive` is **required** (no `?`, no read-time default). No backward-compatibility code in `CustomMetricsContext` or anywhere else.

## Schema

```typescript
// src/types/customMetrics.ts

export type CustomMetricPrimitive = "numeric" | "ordinal" | "nominal";

export type CustomMetricType = "health" | "competition";

// `inputType` is kept orthogonal to `primitive`. Today a numeric metric
// is always rendered as "numeric"; an ordinal metric is rendered as
// "radio". A future story can wire a menu / select / other widget by
// adding to this union without touching the primitive enum.
export type CustomMetricInputType = "numeric" | "radio";

export interface CustomMetricLevel {
  label: string;
  // Present => ordinal level (numeric corollary). Absent => nominal level
  // (no meaningful number). Form enforces "all-or-none" per metric.
  value?: number;
  // Optional color swatch. Saved when the user fills it in; the log row
  // for ordinal customs ignores it for v1 (radio rendering). Reserved
  // for a follow-up that adds the color-swatch input path.
  color?: string;
}

export interface CustomMetricDef {
  id: string;
  ownerId: string;
  name: string;
  metricType: CustomMetricType;
  primitive: CustomMetricPrimitive;

  // Numeric-only config. Required when primitive === "numeric"; omitted
  // otherwise. For ordinal metrics the form derives yTopRaw/yBottomRaw
  // from `levels` at save time and writes those values, so the chart
  // engine reads them like always. `goalRaw` and `avgDecimals` are kept
  // optional on ordinal too because they're still meaningful (e.g.
  // "average mood >= 4"); the form greys them out where the story
  // demands (goal for Y/N specifically).
  unit?: string;
  goalRaw?: number;
  yTopRaw?: number;
  yBottomRaw?: number;
  avgDecimals?: number;

  // Categorical config. Required when primitive ∈ {"ordinal", "nominal"};
  // omitted for numeric. Order is meaningful for ordinal (matches
  // ascending `value`), incidental for nominal.
  levels?: CustomMetricLevel[];

  inputType: CustomMetricInputType;
  referenceUrl: string;
  createdAt: number;
  updatedAt: number;
}
```

### Entry storage — no change

`HealthEntry.customMetrics` and `CompetitionEntry.metrics` are already typed `Record<string, number | string | undefined>` (`src/types/data.ts:36,45`). The shape is already wide enough to carry both numeric corollaries (number) and future nominal labels (string). No storage-shape change needed.

### Top-level button ↔ schema mapping

| User picks | Saved `primitive` | Saved `inputType` | Saved `levels` |
|---|---|---|---|
| Numeric | `"numeric"` | `"numeric"` | omitted |
| Categorical | `"ordinal"` | `"radio"` | from table editor (label + value, color optional) |
| Y/N | `"ordinal"` | `"radio"` | `[{label:"No", value:0}, {label:"Yes", value:1}]` (hardcoded) |

There is no schema flag for "this is Y/N." Y/N is just an ordinal with the canonical two levels. Edit-mode infers which top-level button to highlight from `primitive` + `levels` shape:
- `primitive === "numeric"` → Numeric.
- `primitive === "ordinal"` and `levels` is exactly `[{label:"No", value:0}, {label:"Yes", value:1}]` → Y/N.
- Otherwise → Categorical.

## Form changes (`src/components/tracking/CustomMetricForm.tsx`)

Layout:

```
[Type]    ( ) Numeric    ( ) Categorical    ( ) Y/N

[Name]    [_____________________________]

[Levels]  (Categorical only; hidden for Numeric and Y/N)
          +---+---------+--------+--------+
          | # | Label   | Value  | Color  |
          +---+---------+--------+--------+
          | 1 | ...     |  ...   |        |
          +---+---------+--------+--------+
          [+ add row]

[Unit]      [____]    <-- greyed for Categorical and Y/N
[Goal]      [____]    <-- greyed for Y/N; editable for Numeric and Categorical
[Y top]     auto      <-- derived from levels for Categorical and Y/N; user-entered for Numeric; greyed when derived
[Y bottom]  auto      <-- same as Y top
[Decimals]  [____]    <-- editable for all three
[Ref URL]   [____]    <-- unchanged
```

Behavior:
- Switching the top-level button clears the dependent fields (e.g. switching from Categorical to Numeric clears `levels`; switching to Y/N clears any partially-entered levels and uses the hardcoded pair). User confirmation only required in edit mode where existing entries reference the metric (mirrors the existing `dataShapingChanged` confirm guard at `CustomMetricForm.tsx:218-238`).
- At submit time for Categorical: validate every row has a label and a finite numeric value (since v1 only allows ordinal; nominal is deferred). Empty value column → form error. Reject duplicate values to keep aggregation deterministic.
- At submit time for Categorical: derive `yTopRaw = max(levels.value)`, `yBottomRaw = min(levels.value)`. Store these. The chart engine sees a regular pair of y-range numbers.
- The `INPUT_TYPE_OPTIONS` constant (currently a numeric-only `<select>`) is removed. Input type is implied by the top-level button.

## Log input rendering (`src/components/logs/MetricInputRow.tsx`)

Today: three branches — `numeric`, `colorScale`, `tree`. The `radio` inputType is type-reserved but unused.

For DGT-50:
- The custom-metric render path in `HealthLog.tsx`/`CompetitionLog.tsx` continues to default custom metrics to `inputType: "numeric"` rendering when `primitive === "numeric"`.
- When `primitive === "ordinal"`, render a horizontal radio group: one `<input type="radio">` per level, with the `label` as visible text and the `value` (numeric corollary) as the stored value. Stored shape stays `number` in the entry's `customMetrics` map.
- `primitive === "nominal"` is unreachable in v1 (the form blocks it). The render path can early-return `null` with a runtime assert for defense in depth.

Styling note: the existing built-in `radio` input row was hidden from the form for being un-wired in `CustomMetricForm.tsx:20-27`. That commit comment becomes inaccurate after DGT-50 — update it.

## Chart implications

None to the chart engine. Save-time derivation of `yTopRaw`/`yBottomRaw` for ordinals means the bar/line renderer reads a regular numeric range. Tick marks at integer values fall out naturally. Aggregation uses mean for v1 (median is deferred).

## File-level change summary

| File | Change |
|---|---|
| `src/types/customMetrics.ts` | Add `CustomMetricPrimitive`, `CustomMetricLevel`. Add `primitive` (required) and `levels` (optional) to `CustomMetricDef`. Mark `unit`, `goalRaw`, `yTopRaw`, `yBottomRaw`, `avgDecimals` optional. |
| `src/components/tracking/CustomMetricForm.tsx` | Three-button type chooser; levels table editor; conditional field greying; submit-time level validation and y-range derivation; remove `INPUT_TYPE_OPTIONS` constant. |
| `src/components/tracking/CustomMetricForm.module.css` | Styles for the type chooser row, levels table, color swatch column. |
| `src/components/logs/MetricInputRow.tsx` | New ordinal branch (radio group from levels). |
| `src/contexts/CustomMetricsContext.tsx` | In `fromDoc` (line 80): add a read for `primitive` (no default — `primitive` is required, so an invalid/missing value should throw rather than silently coerce); add a read for `levels`. The existing `inputType === "radio" ? "radio" : "numeric"` coercion at line 86 stays — the form now writes both values legitimately, so the second branch is no longer a fallback but a real option. Pass `primitive` and `levels` through on add/update. |
| `src/components/logs/HealthLog.tsx`, `CompetitionLog.tsx` | Plumb `primitive`/`levels` into the row's render decision. |
| `src/types/customMetrics.test.ts` (new) | Type-level fixtures for the three primitives. |
| Tests in `tracking/`, `logs/`, `metrics/` | New cases covering ordinal create, ordinal log, Y/N quick-pick, type-switch in edit mode. |

## Open questions parked for follow-ups

These came up in design but are out of scope for DGT-50:
1. Nominal-in-v1 vs. v2 — currently v2 (deferred).
2. Storing label alongside value in entries for legibility after metric rename — design notes lean "store number"; revisit if a real rename incident hurts.
3. Per-metric aggregation override (mean vs. median for ordinals) — UI doesn't expose this yet; defaults to mean.
4. CODAP export for ordinals — current behavior matches hydration (export the number); the question of "also export the label as a separate attribute" is parked.

## References

- `notes/primitive-metric-typing.md` — broader three-primitive model and design rationale.
- Slack thread on DGT-50 (Leslie's reply): "numeric/categorical/Y/N I think" + users will understand types from displays.
