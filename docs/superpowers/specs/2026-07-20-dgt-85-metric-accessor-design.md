# DGT-85 — Unified metric-value accessor (design)

Follow-up to DGT-80. DGT-80 merged the three per-type log pages into one Metrics Data Entry Log but deliberately kept two separate row dispatchers and per-type value plumbing. This spec designs the **metric-value accessor**: a single seam for reading and writing a metric's scalar value across the three still-separate DataContext storage shapes, **without a storage migration**.

## Scope

This spec covers **DGT-85 item 1 (the accessor)** and **item 4 (the count-inflation fix)** only.

Deliberately **out of scope for this spec** (they build on this seam):

- **Item 2 — merging the two row *components*** (`HealthMetricRow` + `PerfCompMetricRow`) into one. This spec makes the existing rows storage-agnostic by routing their value read/write through the accessor, which is the prerequisite for the merge; the merge itself is a separate design.
- **Item 3 — first-column "Summary" semantics** (unified average vs. Competition running-total/win-rate vs. Performance latest). Blocked on a product/design call from Leslie.
- **Storage migration** (collapsing HealthEntry's named fields + the three slices into one map). That is DGT-86. The accessor is the seam it plugs into.
- **Per-row sparkbars** — DGT-69.

## Background: the three storage shapes (current, unchanged)

Every metric value is a scalar (`number | string | undefined`) living in one of three places (`src/types/data.ts`):

| Metric group | Storage location |
|---|---|
| Health built-ins (`hydration`, `sleepTime`, `sleepEfficiency`, `protein`, `leanMass`) | Named field on `HealthEntry` |
| Health customs | `HealthEntry.customMetrics[id]` |
| Performance + Competition (built-in and custom) | `entry.metrics[id]` |

Two health things are **not** scalar values and stay special-cased on metric identity (as DGT-80 established):

- **`availability`** — a nested tree (`{ practiceHeld, practiceParticipation, gameHeld, gameParticipation }`), not a metric value. It is excluded from the scalar accessor's read/write. Its "filled" state is still needed by callers, so `isMetricFilled` special-cases it (see below).
- **`relativeProteinIntake`** — a placeholder row with no value/widget.

Note that **hydration's *value* is a normal scalar** (`HealthEntry.hydration`) and therefore *does* go through the accessor; only its *widget* (a color scale) is special-cased in the row layer.

Writes are partial merges keyed by ISO date; `undefined` deletes a field via `withDeleteSentinels` in `DataContext.tsx` (health declares `["availability", "customMetrics"]` as deep-map keys, perf/comp declare `["metrics"]`). The accessor must preserve this: passing `undefined` as a value must still reach the setter as `undefined` so the delete sentinel fires.

## The migration seam — `resolveStorage` (pure)

The single place that enumerates every per-metric storage variation. Everything else keys off it.

```ts
type HealthNamedField = "hydration" | "sleepTime" | "sleepEfficiency" | "protein" | "leanMass";

type StorageLoc =
  | { kind: "healthNamed"; field: HealthNamedField }
  | { kind: "healthCustom" }   // customMetrics[id]
  | { kind: "map" };           // metrics[id]  (performance + competition)

function resolveStorage(tracked: TrackedMetric): StorageLoc;
```

Resolution rule:

- `tracked.type === "health"` and `tracked.id` is one of the five named fields → `{ kind: "healthNamed", field }`.
- `tracked.type === "health"` otherwise → `{ kind: "healthCustom" }`.
- `tracked.type === "performance" | "competition"` → `{ kind: "map" }`.

**Why this is the migration seam:** when DGT-86 moves all metrics into a single DB map, `resolveStorage` returns `{ kind: "map" }` for everyone, the three-way branch collapses, and `getMetricValue` / `isMetricFilled` / `resolveWrite` all become uniform pass-throughs. The per-metric customization is deleted at exactly one place instead of being unpicked from switch statements across the codebase.

`availability` is not a scalar and is never passed to `resolveStorage` for read/write; it only appears in `isMetricFilled`'s special case.

## Read side (pure)

`MetricEntry` is the union `HealthEntry | PerformanceEntry | CompetitionEntry`; the caller passes the entry matching `tracked.type`, and `resolveStorage` narrows which field to read.

```ts
function getMetricValue(tracked: TrackedMetric, entry: MetricEntry): number | string | undefined;
function scalarFilled(value: number | string | undefined): boolean;
function isMetricFilled(tracked: TrackedMetric, entry: MetricEntry): boolean;
```

- `getMetricValue` dispatches on `resolveStorage`: `healthNamed` → `entry[field]`, `healthCustom` → `entry.customMetrics?.[id]`, `map` → `entry.metrics?.[id]`.
- `scalarFilled(v)` is the single filled-definition: `typeof v === "number" && Number.isFinite(v)`, or `typeof v === "string" && v.trim() !== ""`.
- `isMetricFilled`: for health `availability` → `availabilityFilled(entry)`; everything else → `scalarFilled(getMetricValue(tracked, entry))`.

**No drift with the existing health-only path.** `isHealthFieldFilled` (in `src/utils/healthCompleteness.ts`) is still consumed by `Dashboard.tsx` and `ActivityCalendar.tsx` for health-only chips, so it stays. It is refactored to call the *same* `scalarFilled` + `availabilityFilled` core, so there is exactly one filled-definition shared by both the accessor and the health-only consumers.

### Call-site collapse: the chip resolver

In `MetricsDataEntryLog.tsx`, the ~12-line inline health-vs-map branch inside the chip resolver collapses to one accessor-backed predicate:

```ts
getChipStateBy(dueMetrics.map((m) => m.id), (id) => {
  const m = dueById.get(id);
  return m ? isMetricFilled(m, entryFor(m.type)) : false;
});
```

where `entryFor` selects the type-appropriate entry (`healthEntry` / `performanceEntry` / `competitionEntry`) already in scope.

## Write side — `resolveWrite` (pure) + `useMetricWriter` (thin hook)

The routing is a pure function so it is unit-testable with no React or context:

```ts
type WriteSlice = "health" | "performance" | "competition";

function resolveWrite(
  tracked: TrackedMetric,
  value: number | string | undefined,
): { slice: WriteSlice; partial: Partial<HealthEntry | PerformanceEntry | CompetitionEntry> };
// healthNamed   -> { slice: "health",       partial: { [field]: value } }
// healthCustom  -> { slice: "health",       partial: { customMetrics: { [id]: value } } }
// map (perf)    -> { slice: "performance",  partial: { metrics: { [id]: value } } }
// map (comp)    -> { slice: "competition",  partial: { metrics: { [id]: value } } }
```

The hook wires slices to the existing DataContext setters:

```ts
function useMetricWriter(): {
  setMetricValue: (tracked: TrackedMetric, dateIso: string, value: number | string | undefined) => void;
};
```

`useMetricWriter` closes over `setHealthEntry` / `setPerformanceEntry` / `setCompetitionEntry` from `useData()` and dispatches `slice → setter(dateIso, partial)`.

- **Delete semantics preserved:** `value === undefined` flows straight through the partial to the setter, where `withDeleteSentinels` turns it into a `deleteField()`. Unchanged.
- **Parsing stays at the widget boundary:** raw-string → `number | string` parsing (today in `setPerformanceValue` / `setCompetitionValue`) stays in the row/widget layer. The accessor takes an already-typed value.
- **Boundary — non-scalar/special writes bypass the accessor:** the `availability` tree widget keeps writing `setHealthEntry(dateIso, { availability: {...} })` directly, and `relativeProteinIntake` writes nothing. Only these bypass the accessor. Hydration's scalar value goes through `setMetricValue` normally.

This replaces `setPerformanceValue`, `setCompetitionValue`, and the `setHealth` wiring in `MetricsDataEntryLog.tsx`. The two existing row components read via `getMetricValue` and write via `setMetricValue`, so they no longer encode storage shape — which is what sets up item 2's merge.

## Count fix — `metricRendersRow` (pure, separate from the accessor)

A rendering-capability predicate, kept **out** of `metricAccessor.ts` because it depends only on the metric definition (not on an entry or a value) — the altitude is "does this render a row?", not "what is this value?".

```ts
function metricRendersRow(tracked: TrackedMetric): boolean;
```

Returns `false` for **nominal customs**, `true` otherwise. It is the single source consulted by both:

- the section counter in `MetricsDataEntryLog.tsx`: `count = rows.filter(metricRendersRow).length`, and
- `LogMetricRow`: returns `null` when `!metricRendersRow(tracked)`.

Because both consult one predicate, the "(N metrics)" header and the rendered rows cannot disagree — fixing the DGT-80 nominal-health-custom inflation (a nominal health custom was counted but `HealthMetricRow` rendered nothing).

**Decision — uniform across types.** `metricRendersRow` returns `false` for *all* nominal customs, health and perf/comp alike. A nominal custom has no scalar widget in any type, and nominal customs are only reachable via externally-written Firestore docs (not form-creatable). This changes perf/comp nominal customs from "empty `<tr>` shell" to "no row" — an intentional consistency improvement over DGT-80, where only health nominals rendered nothing.

`relativeProteinIntake` renders a placeholder `<tr>` (a real row) and therefore returns `true` — it is not affected.

## Files

| File | Contents | New/changed |
|---|---|---|
| `src/metrics/metricAccessor.ts` | `resolveStorage`, `getMetricValue`, `scalarFilled`, `isMetricFilled`, `resolveWrite` (pure) | new |
| `src/components/logs/useMetricWriter.ts` | `useMetricWriter` hook (consumes `DataContext`) | new |
| `src/components/logs/useTrackedMetrics.ts` | add `metricRendersRow` (colocated with the counter) | changed |
| `src/utils/healthCompleteness.ts` | refactor `isHealthFieldFilled` to share `scalarFilled` + `availabilityFilled` core | changed |
| `src/components/logs/MetricsDataEntryLog.tsx` | chip resolver → `isMetricFilled`; writes → `useMetricWriter`; count → `metricRendersRow` | changed |
| `src/components/logs/LogMetricRow.tsx` | short-circuit via `metricRendersRow`; value read/write via accessor | changed |
| `src/components/logs/HealthMetricRow.tsx` | read via `getMetricValue`, write via `setMetricValue` (scalar branches); availability/placeholder unchanged | changed |
| `src/components/logs/PerfCompMetricRow.tsx` | read via `getMetricValue`, write via `setMetricValue` | changed |

## Testing

Pure unit tests (no mocks needed):

- `resolveStorage` — one case per kind: a named health built-in, a health custom, a performance metric, a competition metric.
- `getMetricValue` — reads the correct location for each kind; returns `undefined` for unset.
- `scalarFilled` / `isMetricFilled` — finite number filled, `0` filled, `NaN` not filled, empty/whitespace string not filled, non-empty string filled; `availability` delegates to `availabilityFilled`.
- `resolveWrite` — correct `slice` + `partial` shape per kind; `undefined` value preserved in the partial (delete path).
- `metricRendersRow` — `false` for nominal customs (health and perf/comp), `true` for scalar customs, built-ins, and `relativeProteinIntake`.
- `isHealthFieldFilled` — existing tests still pass after the refactor (no behavior change for Dashboard/ActivityCalendar).

The seam is validated immediately against real call sites (the chip resolver and both existing row components) even before item 2's row merge lands.

## Migration note

The accessor is low-regret regardless of the DGT-86 decision. If storage is later unified (or reset to a unified shape), `resolveStorage` collapses to a single `{ kind: "map" }` branch and the accessor becomes a thin pass-through. If it never is, the accessor is clean separation of storage from UI. Either way, the per-metric storage customization lives in one greppable, testable function.
