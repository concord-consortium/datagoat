# DGT-77 — Unify the CODAP export: three per-category datasets, metrics as typed attributes

Status: design approved (brainstorming), pending spec review
Date: 2026-07-08
Ticket: DGT-77 (parent epic DGT-21 MultiSport). Supersedes the ticket's original scope (time-valued metrics as times in CODAP), which is absorbed here.

## Problem

Today's `/codap` export (DGT-32 / DGT-8) sends two datasets — `DataGOAT-Health` (mislabeled "Health & Performance") and `DataGOAT-Competition` — each keyed by date with metrics as columns. It has these gaps:

- **Performance metrics are never exported.** The plugin reads only health + competition data.
- **No per-attribute metadata.** Attribute types are inferred by scanning sample rows (`inferAttributeType`), so numeric attributes carry no units, and there is no time formatting.
- **Ordinal/categorical values export as raw numbers.** A custom ordinal or Win/Loss exports its numeric level value (e.g. `0` / `1`) instead of its label ("Loss" / "Win").
- **Time metrics export as bare decimals** with no `h:mm` rendering.

## Goal

A CODAP export covering all tracked metrics across health, performance, and competition, where each metric is a first-class, draggable, correctly-typed CODAP attribute carrying its unit, time formatting, and categorical labels.

## Design decisions (resolved during brainstorming)

### 1. Three per-category datasets, wide, keyed by date

Keep the original shape of **one dataset per category** — `Health`, `Performance`, `Competition` — each a **wide** table with **metrics as attributes** and **one row per date**. Category is expressed by dataset identity, not by a field.

Rationale: the thing that makes CODAP valuable is dragging an attribute onto an axis, which requires metrics-as-attributes (wide). A single unified long/tidy table (`date, category, metric, value`) was considered and rejected because its single `value` column is not draggable per-metric and mixes types (see Alternatives). Splitting by category also dissolves the worst sparsity (health columns are never empty-because-it's-a-competition-row); the residual within-category sparsity (e.g. Lean Mass logged 2–3×/yr) is normal for CODAP, which drops missing values from plots.

Upsert on re-send stays keyed on `date` (the existing `sendDataset` mechanism), one row per date.

### 2. Attributes = tracked metrics, with Policy A ("dual") representation

Each dataset's attributes are `date` plus the profile's tracked metrics for that category (`trackedHealthMetrics`, `trackedPerformanceMetrics`, `trackedCompetitionMetrics`), including custom metrics of that category. Attribute metadata is driven **directly off the metric registry / custom-metric definitions**, not inferred from sample rows.

The organizing principle: **emit a number wherever a number is meaningful (so it graphs/averages), and add a display companion (clock string or label) wherever the raw number reads poorly.**

| Metric flavor | Attribute(s) emitted | CODAP type / metadata |
|---|---|---|
| `date` | `date` | **date** type, date-only format |
| Plain numeric (protein, sleepEfficiency, scores, goals, hydration, numeric customs) | one | **numeric**, `unit` = `displayUnit ?? unit` |
| Time (sleepTime, competition times, time customs — `timePrecision` set and `resolveTimeLayout` non-null) | **two**: `<name>` + `<name> (<clock-pattern>)` | numeric (decimal in the layout's coarsest unit, graphable) with `unit` = coarsest unit; **plus** a categorical clock-string companion from `formatDecimalToTime` |
| Ordinal (mood, winningPercentage, ordinal customs — has `levels` with numeric `value`s) | **two**: `<name>` (label) + `<name> (level)` (numeric) | categorical **label** (mapped from stored value via `levels`) + numeric level companion |
| Nominal / compound (availability, nominal customs) | one | categorical **label** only (no number) |

**Companion naming:**
- Time: suffix is the layout's clock pattern — `h:mm`, `m:ss`, `h:mm:ss`, or `s` (seconds-only). Example: `Total Sleep Time` + `Total Sleep Time (h:mm)`.
- Ordinal: label attribute keeps the plain metric name; the numeric companion gets the ` (level)` suffix. Example: `Winning Percentage` (values "Win"/"Loss") + `Winning Percentage (level)` (values 1/0).

**Value production per flavor** (per row, per metric `id`):
- Numeric: the stored number, or `null` if not logged.
- Time: `value` = stored decimal (already in coarsest unit per DGT-19); companion = `formatDecimalToTime(value, layout)`; both `null` if not logged.
- Ordinal: `value (level)` = the stored numeric level value; label = `levels.find(l => l.value === stored)?.label`; both `null` if not logged. (Ordinal selections persist `level.value` — confirmed in `OrdinalRadioGroup`.)
- Nominal/compound: label string; for availability, reuse the existing compound-string builder in `readHealthField`. Nominal customs: map stored value→label via `levels` when it matches a level value, else pass the stored string through (nominal input is not fully wired today; handle defensively).

### 3. Replace `inferAttributeType` with registry-driven metadata

Because each attribute's type/unit/format is now known from the `MetricDefinition` / `CustomMetricDef`, drop the sample-scanning inference. Introduce a builder that, given a metric definition, returns its CODAP attribute spec(s): `{ name, type, unit?, precision?, description? }[]` (one or two specs per metric, per the table). `date` remains special-cased to the CODAP `date` type. This also removes the empty-rows-defaults-to-categorical reconciliation branch on re-send: on re-send we set attribute metadata from the definition unconditionally rather than re-inferring.

### 4. Plugin UI: three checkboxes

The selection UI goes from two checkboxes (Health & Performance / Competition) to **three** (Health / Performance / Competition), all on by default. Each drives one `sendDataset` call. The mislabeled "Health & Performance" copy is removed. Empty-selected datasets still send (create context + table) so the table surfaces even with no rows, matching current behavior.

### 5. Forward path for multiple measurements per day (not built now)

The one-row-per-date shape assumes a single measurement per (metric, date), which is true today (each of `healthEntries` / `performanceEntries` / `competitionEntries` is a Firestore doc keyed by date). A backlog story will allow multiple measurements per metric per day. When it lands, the export gains an `index` (a.k.a. `entry`) attribute that counts from 1 for days with multiple measurements, and the upsert key becomes `(date, index)`. The wide attribute layout is otherwise unchanged. This is explicitly **out of scope** here; the design just leaves the door open.

## Affected code

- `src/codap/CodapPlugin.tsx` — read `usePerformanceData()` and `useCustomMetrics()` alongside health/competition; three-checkbox UI; three `sendDataset` calls; row builders extended to emit companion attributes and to map ordinal values→labels. `healthEntryToRow` / `competitionEntryToRow` grow a performance sibling and share the flavor-driven attribute/value logic.
- `src/codap/codapApi.ts` — replace `inferAttributeType` with a registry-driven attribute-spec builder; thread `unit` / `precision` / `description` / date-format through the `create dataContext` attrs payload and the re-send reconciliation (`updateAttribute`). `sendDataset` gains the ability to accept per-attribute metadata rather than a bare `string[]` of names.
- `src/metrics/*` — no schema changes; the export consumes `MetricDefinition` (`unit`, `displayUnit`, `timePrecision`, `levels`, `inputType`) and `CustomMetricDef` (`primitive`, `unit`, `timePrecision`, `levels`) as-is.
- Reused utilities: `resolveTimeLayout`, `layoutUnits`, `formatDecimalToTime` from `src/utils/timeValue.ts`.

## Testing

- Unit-test the attribute-spec builder: each flavor produces the right one/two specs with correct type, unit, and companion name (including each clock pattern).
- Unit-test the row builders: numeric, time (value + clock companion), ordinal (level + label, mapped via `levels`), nominal/availability, and "not logged" → `null` on every attribute.
- Verify performance data is exported (closes the current gap) and that the Win/Loss regression (raw `0/1`) is fixed (label present).
- Keep the existing upsert/re-send tests green (still keyed on `date`).

## Alternatives considered

- **Long/tidy single dataset** (`date, category, metric, value` [+ `unit`, `displayValue`]). Gives a genuine category field and trivially unifies the three datasets, but the `value` column is not draggable per-metric and, mixing types, becomes categorical — losing the numeric graphing/averaging that is the whole point of CODAP. Rejected.
- **One unified wide dataset with category grouping.** Metrics-as-attributes, but a date row spans all three categories, so CODAP can't group rows by category, and mixing all categories maximizes sparsity. Rejected in favor of three per-category datasets.
- **Hierarchical Day→Measurements now** to pre-solve multi-measurement. Deferred (YAGNI): the story is unscheduled and its data shape isn't pinned; the `index`-field path (decision 5) extends flat-wide without a disruptive CODAP schema migration.
- **Single-attribute (Policy B) representation.** One attribute per metric (numeric-only for time, label-only for ordinal). Fewer columns/less code, but gives up either `h:mm` display or numeric ordinal analysis. Rejected in favor of Policy A.
