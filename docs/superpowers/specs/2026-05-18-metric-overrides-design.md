# DGT-48: Editable metric goals and axis bounds

Jira: [DGT-48](https://concord-consortium.atlassian.net/browse/DGT-48) (split from DGT-36, epic DGT-21 MultiSport)

## Problem

Built-in metrics (hydration, protein, sleep efficiency, etc.) ship with goal values and chart
y-axis bounds that are fixed in code. A user cannot tailor them. A user whose appropriate goal
or useful chart window differs from the default has no way to adjust either. For example, the
weight metric may default to a 0-500 axis range when a given athlete only ever needs to see
150-200.

## Goal

Let a user override, per metric:

- the **goal** value used to draw the goal line on charts
- the chart **y-axis top** and **y-axis bottom**

The overridden values are used everywhere the metric is charted. The edit experience reuses the
existing custom-metric form, with the fields a user cannot change for a built-in metric shown
disabled.

## Scope

In scope:

- A per-user override store for metric goal / y-axis top / y-axis bottom.
- Editing those three values for built-in metrics through the existing custom-metric form.
- A pencil (edit) affordance on built-in metrics, in the same places custom metrics have one.
- Range checking: the goal must fall within the metric's built-in `[min, max]` data range.
- Overridden values flowing into all charts for that metric.

Deferred (not in this story, may be added later):

- Revert-to-default / clear-override affordance. An override is sticky; to restore the default a
  user re-enters it manually.
- Discarding overrides when the user's profile (gender / athlete type) changes.
- A chart-side badge distinguishing an overridden goal line from a default one.

Naming note: the feature deliberately avoids "built-in" in identifiers. Although only built-in
metrics are editable this way today, the override store may later apply to custom metrics too.
Hence `metricOverrides` / `MetricOverridesContext`.

## Design

### 1. Storage: `metricOverrides` Firestore collection

A new top-level collection. One document per (user, metric), holding only the override values:

```ts
interface MetricOverride {
  id: string;        // Firestore doc id
  ownerId: string;   // current user's uid
  metricId: string;  // the metric being overridden, e.g. "hydration"
  goalRaw?: number;
  yTopRaw?: number;
  yBottomRaw?: number;
  createdAt: number; // ms epoch, server-managed
  updatedAt: number; // ms epoch, server-managed
}
```

The document never duplicates a metric's definition data (name, unit, input type, etc.), so it
stays correct when built-in metric definitions later move into Firestore.

Firestore security rule mirrors the existing `metricDefinitions` collection: a user may read and
write only documents whose `ownerId` equals their uid.

### 2. `MetricOverridesContext`

A small context paralleling `CustomMetricsContext`:

- Snapshot-listens to the current user's `metricOverrides` documents.
- Exposes `getOverride(metricId): MetricOverride | undefined` and
  `saveOverride(metricId, patch)`.
- On every snapshot, registers the overrides as **partial** chart-config overlay entries (see 3).

### 3. Partial overlay merge in `getMetricChartConfig`

`getMetricChartConfig` already consults a `_customConfigs` registry, where a custom-metric entry
**fully replaces** the resolved config. Metric overrides need different semantics: they must
**merge on top of** the hardcoded `CONFIG` so the built-in's `formatValue`, `inverted`, and
`random` are preserved.

A parallel `_metricOverrides` registry holds partial `{ goalRaw?, yTopRaw?, yBottomRaw? }`
entries keyed by `metricId`. `getMetricChartConfig` resolves config as:

1. base config (custom-metric full config, or hardcoded `CONFIG`, or `DEFAULT_CONFIG`)
2. shallow-merge any `_metricOverrides` entry for that id on top

Components already subscribe to overlay changes via `useChartConfigSync()`; the override
registry participates in the same change notification so charts re-render on save.

### 4. `lookupGoalLine` precedence

`lookupGoalLine` in `chartSeries.ts` resolves a goal line for the chart. New precedence:

1. metric override `goalRaw`, if present
2. existing profile-keyed switch (`protein`, `sleepEfficiency`, `leanMass`, competition metrics)
3. `config.goalRaw`

An override therefore wins even for metrics whose default goal is computed from the user's
profile.

### 5. Reuse `CustomMetricForm` in override mode

`CustomMetricForm` is already a unified add/edit component served at
`/add-metric/:type/:metricId`. It gains an **override mode**:

- The form's gateway detects when `metricId` resolves to a built-in metric definition rather than
  a custom one. (Built-in ids such as `hydration` do not collide with custom-metric UUIDs.)
- In override mode the draft state is pre-populated from the built-in `MetricDefinition` plus
  `getMetricChartConfig(metricId)`, then merged with any existing `MetricOverride`.
- Every field is rendered **disabled except goal, y-axis top, and y-axis bottom**. `TextField`
  already accepts a `disabled` prop, and `CustomMetricLevelsEditor` already accepts `readOnly`.
- The goal-determination sentence from `resolveGoalText(metricId, profileKey)` is shown near the
  goal field. Each editable field also shows its computed default as a hint. Together these make
  it clear when a value has been manually changed away from its default.
- On submit, override mode writes to `metricOverrides` via `MetricOverridesContext.saveOverride`
  instead of writing a custom-metric document via `CustomMetricsContext`.

The route is unchanged; the pencil link for a built-in metric points at the same
`/add-metric/:type/:metricId` path.

### 6. Pencil affordance for built-in metrics

`SortableMetricRow` (on `/setup/tracking`) and the `AddMetric` list render the edit pencil only
when a metric `isCustom`. Both render it for built-in metrics too, linking to
`/add-metric/:type/:metricId`. No new screens.

### 7. Range validation

In override mode the form's validation adds one rule: the goal must be within the built-in
metric's `[min, max]` range when both bounds are defined. The existing `yBottom < yTop` check is
kept. Goal-within-axis-window is intentionally not enforced.

Validation errors surface through the form's existing single `error` alert.

## Data flow

```
pencil on built-in metric row
  -> /add-metric/health/hydration
  -> CustomMetricForm detects built-in id -> override mode
  -> user edits goal / y-axis top / y-axis bottom
  -> submit -> MetricOverridesContext.saveOverride -> metricOverrides doc write
  -> snapshot listener fires -> partial overlay entry registered
  -> getMetricChartConfig / lookupGoalLine pick up the override
  -> charts for that metric re-render with the new values
```

This mirrors the existing custom-metric save flow.

## Error handling

- Validation errors (non-finite values, goal out of `[min, max]`, `yBottom >= yTop`) are caught
  in the form's submit handler and shown in the existing error alert.
- Firestore write failures surface the same way custom-metric write failures do today.

## Testing

Colocated `*.test.ts` / `*.test.tsx`:

- partial overlay merge in `getMetricChartConfig` (override merges, base fields preserved)
- `lookupGoalLine` precedence (override > profile-keyed > `config.goalRaw`)
- range validation (goal inside / outside `[min, max]`, `yBottom < yTop`)
- `CustomMetricForm` override mode: pre-population from definition + existing override, correct
  fields disabled, write routed to `MetricOverridesContext`
- `MetricOverridesContext` CRUD against the Firestore emulator

## Estimate

3 story points. The work is mostly wiring into existing seams: the overlay registry, the
custom-metric form, and the pencil affordance are all reused rather than built fresh.
