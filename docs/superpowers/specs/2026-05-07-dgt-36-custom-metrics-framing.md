# DGT-36: Custom Metrics — Design Framing

Lighter-weight than a full spec. Captures decisions made and open questions for an exploratory conversation. The implementation plan will be drafted separately once the open questions resolve.

## What DGT-36 asks for

Let athletes define their own metrics — not just pick from the built-in Health & Wellness / Performance lists. A custom metric needs a name, a type, an optional unit, and a goal value, and once created it shows up alongside built-ins in the tracked-metrics list (sortable, enable/disable, log values daily).

The Jira description's specifics (type list `{color, number, Y/N, reps}`, unit list `{lbs, %, sec, min, hour, yds, feet}`, 128-char name cap, "edit button next to each attribute") are illustrative, not authoritative — written from the prototype, not the React port.

## Decisions made

### 1. Scope

- **Custom metrics are editable. Built-ins are not.** The MetricDetail page stays read-only for built-ins; an edit affordance appears only when the metric is user-authored.
- **Cleanup of `addableMetrics.ts` is in scope.** The existing 10 placeholder rows ("Wellness Metric1"…"Metric10") get removed; the AddMetric page transforms from "browse pre-defined addable metrics" into "create your own."

### 2. Type vocabulary (v1)

- **`numeric`** (free-form number, with optional unit)
- **`radio`** (Y/N, two-option toggle)

Defer color-scale and 1-5 rating styles until a user actually asks. The two above cover ~80% of plausible custom metrics (reps, weight, time, distance, "did I stretch today?").

### 3. Form approach

- **Minimal inputs; derive defaults.** When creating a custom metric, the user supplies: name, input type, unit (optional), goal value, y-axis range (top + bottom).
- **Y-range is user-entered**, not auto-derived. Auto-deriving from goal would constrain the chart awkwardly.
- **`avgDecimals` defaults to 1** but is user-overridable later (probably from the edit screen, not the create form).
- Chart type defaults to **bar** (matches every built-in today). Not user-configurable in v1.

### 4. Unified registry

The current code splits metric metadata across two tables:
- `MetricDefinition` in `src/metrics/wellnessMetrics.ts` and `performanceMetrics.ts` (registry)
- `MetricChartConfig` in `src/charts/metricChartConfig.ts` (chart-specific fields)

The historical reason for the split was audience separation — content folks edit one file, chart engineers edit the other. That reasoning evaporates for user-authored metrics, where the user is the only author.

**Decision: collapse the two tables into a single `MetricSpec` shape.** Built-in metrics get migrated into the same shape. Both built-ins and customs are read through the same registry interface. Consumers don't know or care which is which (except for the edit affordance).

### 5. Persistence — definitions

Custom metric *definitions* embed in the user's Firestore profile (`users/{uid}/profile`). Sharing across users is hypothetical, no near-term commitment, so we accept some future migration risk if sharing becomes real.

### 6. Persistence — entries

`WellnessEntry` migrates from named-fields to the same map shape `PerformanceEntry` already uses:

```ts
// Before
type WellnessEntry = {
  version, date,
  hydration: number, sleepTime: number, sleepEfficiency: number,
  protein: number, leanMass: number,
  availability: { practiceHeld, ... }
}

// After
type WellnessEntry = {
  version, date,
  metrics: Record<string, number | string | ...>
}
```

**No data migration needed** — the app has no real users yet. Built-in wellness IDs (`hydration`, `sleepTime`, etc.) become map keys instead of typed fields.

### 7. UX is provisional

Designer will revise after first cut. We make it up; they polish later.

## Open questions (tactical)

These haven't been decided. Most can be settled in a 5-minute follow-up; none are blocking the conversation framing.

| # | Question | Default if forced |
|---|---|---|
| O1 | Unit field: free-form text vs constrained menu vs hybrid? | Hybrid (menu + "Other") |
| O2 | Custom metric ID minting: `custom-${nanoid()}` vs slug-from-name? | nanoid (avoids name-collision and rename problems) |
| O3 | `availability` in the new map shape: flatten to 4 IDs (`practiceHeld`, `gameHeld`, etc.) or keep as one object-valued map entry? | Flatten — better fits the unified registry; means 4 map keys instead of 1 |
| O4 | Custom-metric storage on profile: one combined `customMetrics: MetricSpec[]` (each carrying its own `metricType` discriminator), or two split `customWellnessMetrics` / `customPerformanceMetrics`? | Combined; the discriminator already exists on `MetricSpec`. |
| O5 | Where does the "+ Create custom metric" entry point live? Top of the AddMetric list? A dedicated CTA on TrackedDataSetup? Both? | Top of AddMetric list, since AddMetric is reachable from TrackedDataSetup's "Add … Metric" buttons. |
| O6 | Does the "edit metric" page reuse the create form with values pre-filled, or is it a separate component? | Reuse, prefilled — same fields. |
| O7 | Custom-metric icon: reuse the existing `custom-metric.svg` (currently used as the AddMetric info button), or a new asset? | Reuse for v1; designer revises. |
| O8 | Editable scope post-creation: every field, or just goal/range/decimals? Changing input type (numeric ↔ Y/N) after entries are logged is a real migration question. | Restrict to goal/range/decimals/unit/name. Input type is locked once any entry exists. |

## Implications worth surfacing in the boss conversation

1. **This is a bigger refactor than the story implies.** Not "drop in a +Add button." Three things move at once: (a) registry table consolidation, (b) entry-shape migration for wellness, (c) new create/edit UI.
2. **Schema change to WellnessEntry.** No data migration cost (no real users yet), but every reader and writer of `WellnessEntry` changes. Roughly the ~7 files the metrics-pipeline memo lists, plus tests.
3. **Future-friendly.** The unified MetricSpec shape is also the natural shape if/when shared metric definitions become real. We're not building for sharing now, but we're not painting into a corner either.
4. **Designer cleanup expected.** UX in v1 is functional, not polished. That's by agreement, not technical debt.
5. **Non-bug-fix, non-trivial scope.** Probably warrants a Sprint allocation and a Design Approver assignment (DGT-36 currently has neither set).

## Rough sketch of the work

Listed in dependency order. Effort estimates are placeholders pending detailed planning.

1. Define `MetricSpec` type. Map existing `MetricDefinition` + `MetricChartConfig` fields into it.
2. Migrate built-in registries (`wellnessMetrics.ts`, `performanceMetrics.ts`, `metricChartConfig.ts`) to export `MetricSpec[]`. Adjust `getMetricChartConfig` accordingly (or delete it — its job folds into the registry lookup).
3. Migrate `WellnessEntry` to map shape. Rewrite `readWellnessMetric` (becomes a one-liner). Update every writer.
4. Add `customMetrics: MetricSpec[]` field to `UserProfile`. Update reads/writes.
5. Build the create-custom-metric form (route off `/add-metric/:type`). Wire to profile updates.
6. Build the edit screen (reuses the form).
7. Add per-row custom-icon rendering in `TrackedMetricsTable` for custom metrics.
8. Replace `addableMetrics.ts` placeholder content. Update or remove the AddMetric "browse" UX.
9. Update tests.

## What's NOT in this story

Worth being explicit so the conversation doesn't drift:

- Sharing custom metrics across users (deferred — see "Persistence — definitions").
- Importing/exporting metric definitions.
- Adding new input types beyond numeric and radio.
- Per-profile (gender × athlete-type) goal variation for custom metrics — custom metrics get one goal value, not a profile-keyed goal table.
- Designer-final visual polish.
