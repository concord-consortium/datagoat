# DGT-36: Custom Metrics — Design Framing (revised)

Supersedes `2026-05-07-dgt-36-custom-metrics-framing.md`. The earlier doc captured a brainstorming pass that landed on "embed custom metric defs in profile"; this revised pass is grounded in a different premise. The earlier file is left committed as a record of the prior thinking.

## TL;DR

DGT-36 ships **only** user-defined custom metrics, stored as a top-level Firestore collection scoped to the creating user. Built-in metrics are unchanged. The application's existing metric registry gains a runtime bridge that merges custom metrics in from Firestore. No data migration, no MetricSpec consolidation, no Activity/Specialization model — those are deferred.

Target: shippable for a stakeholder demo next week.

## Why narrow

A longer architectural conversation surfaced that metrics are properly **content, not code**. In the future:

- All metrics (including current built-ins) should live in the database, edited by the content team without a code release.
- Users shouldn't pick metrics directly. They should pick a sport/activity and a specialization (Football → Quarterback / Linebacker / etc.); the sport×specialization combo determines a default metric set.
- Sport, Specialization, and Metric should all be top-level entities in the database.

That's a multi-story refactor. DGT-36 is not the right place to undertake it. What DGT-36 *can* do without paying that whole cost: **place user-defined metrics as top-level entities in the database** — the shape they'd take in the long-term vision anyway. Built-ins stay where they are for now, and the eventual "migrate built-ins to database" story has a clean precedent to follow.

## In scope

### 1. Firestore collection: `metricDefinitions/{id}`

Top-level. One document per user-created metric.

Fields:
- `id` — `c_${nanoid()}` minted client-side, also the doc ID
- `ownerId` — creating user's UID
- `name` — string, free-form (we'll cap to 128 chars in the form)
- `metricType` — `"wellness" | "performance"`
- `inputType` — `"numeric" | "radio"`
- `unit` — string, free-form (empty allowed)
- `goalRaw` — number
- `yTopRaw` — number
- `yBottomRaw` — number
- `avgDecimals` — number, default 1
- `createdAt` / `updatedAt` — server timestamps

Security rule: read/write only when `request.auth.uid == resource.data.ownerId`. No sharing in v1.

### 2. Entry-value storage

- **WellnessEntry**: add `customMetrics?: Record<string, number | string>`. Built-in fields stay typed.
- **PerformanceEntry**: unchanged. Custom-metric values go in the existing `metrics` map alongside built-in ones (IDs are unique by mint strategy).

No migration of existing entry data. No change to existing code paths for built-in metric reads.

### 3. Tracked-metrics arrays

`profile.trackedWellnessMetrics: string[]` and `trackedPerformanceMetrics: string[]` already accept arbitrary IDs. Custom metric IDs append naturally. No schema change.

### 4. Registry bridge layer

A new `useCustomMetrics()` hook (mirrors the existing `useWellnessData` / `usePerformanceData` patterns) loads the current user's custom metric definitions from Firestore. Existing registry-consuming code gets extended at the seams:

- `getMetricChartConfig(id)` → checks custom map first, falls through to in-code `CONFIG`
- `lookupGoalLine(id, profileKey)` → custom metrics return their `goalRaw` directly (not profile-keyed)
- `readWellnessMetric(entry, id)` → falls through to `entry.customMetrics?.[id]`
- `MetricInputRow` / `MetricDetail` / `AddMetric` / `TrackedMetricsTable` / `useChartSeries` accept a unified registry view

`formatValue` and `random` (currently functions in `metricChartConfig.ts`) get **derived at runtime** for custom metrics:
- `formatValue(v)`: `unit === "%" ? \`${v}%\` : v.toFixed(decimals)`
- `random(rng)`: `randomInt(rng, yBottomRaw, yTopRaw)` for numeric; `randomInt(rng, 0, 1)` for radio

### 5. UI

- **AddMetric page rewrite.** Replace the 10 placeholder rows in `addableMetrics.ts` with: a "+ Create custom metric" CTA at top, then the user's existing custom metrics in a list (with edit/delete affordances).
- **Create form.** New route `/add-metric/:type/new`. Fields: name, input type, unit, goal value, y-axis top, y-axis bottom. Save creates the Firestore doc and appends the ID to the corresponding tracked-metrics array.
- **Edit form.** Same component as create, prefilled. Route `/add-metric/:type/:metricId`. Includes a Delete button.
- **Confirmation dialogs.** When editing a custom metric that already has logged entries, show a confirmation if the user changes `inputType`, `metricType`, or `unit` (the data-impacting fields per O8). Other fields edit silently.
- **Delete.** Confirmation dialog → `deleteDoc(metricRef)` → strip ID from tracked array → navigate back. Orphan entry values in WellnessEntry.customMetrics / PerformanceEntry.metrics are accepted as v1 limitation (invisible without a metric def to render them).
- **Custom-metric icon.** Reuse existing `custom-metric.svg` next to custom rows in TrackedMetricsTable.

## Explicitly out of scope (deferred to future stories)

- Migrating built-ins to the database
- Consolidating `MetricDefinition` + `MetricChartConfig` into a unified `MetricSpec`
- Migrating WellnessEntry fully to map shape
- Sport / Activity / Specialization entities and the onboarding flow that uses them
- Content-authoring UI for the content team
- Sharing custom metrics across users (e.g., coach → team)
- Importing / exporting metric definitions
- Input types beyond numeric and radio
- Profile-keyed (gender × athlete-type) goal variation for custom metrics
- Constrained unit menu (free-form text for v1)

## Tactical decisions (locked)

| # | Decision |
|---|---|
| Unit field | Free-form text. Constrained menu is polish for later. |
| ID minting | `c_${nanoid()}`. Prefix aids log-readability. |
| "+ Create" CTA placement | Top of AddMetric list. |
| Edit form | Reuses create form, prefilled. Same route pattern. |
| Custom-metric icon | Reuse `custom-metric.svg`. |
| Editable scope post-creation | Option B: all fields editable; `inputType`/`metricType`/`unit` prompt for confirmation when entries exist. |
| Delete | Included. Orphaned entry values accepted as v1 limitation. |

## Sketch of work (rough order)

1. Define `CustomMetricDef` type and Firestore schema (one new file).
2. Add Firestore security rule for `metricDefinitions/{id}`.
3. Add `customMetrics` field to `WellnessEntry` type. Update `readWellnessMetric` fallthrough.
4. Add `useCustomMetrics()` hook (mirrors `useWellnessData`).
5. Extend `getMetricChartConfig`, `lookupGoalLine`, derived registry views to accept custom metrics.
6. Build `CustomMetricForm` component (used for both create and edit).
7. Wire create + edit + delete flows; add `hasEntriesForMetric()` helper for confirmation dialogs.
8. Rewrite `AddMetric` page: CTA + user's custom metrics list.
9. Add custom-metric icon affordance in `TrackedMetricsTable`.
10. Tests (form behavior, registry merge, confirmation triggers).

## Risks / caveats for the demo

- **No content-team metrics in the demo.** This story doesn't deliver "content team can edit metrics," which was the boss's underlying frustration. Frame the demo as the *first step* — same data model the content team will eventually use, just authored by the user instead.
- **Free-form unit field** means a demo user can type "lbs" or "Lbs" or "pounds" inconsistently. Expected v1 behavior.
- **Input-type changes after logging entries** are confirmation-gated but not blocked. If a demo user clicks through the confirmation, their data renders weird.
- **Bridge layer is tech debt the day it ships.** Acceptable cost; future story retires it by moving built-ins into the same collection.
