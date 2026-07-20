# DGT-2: Validate custom data names

- **Jira:** DGT-2 (Epic DGT-21 MultiSport)
- **Date:** 2026-06-17
- **Status:** Approved, ready for implementation plan

## Problem

Athletes can create custom metrics via `CustomMetricForm`. Nothing stops them from
naming a custom metric the same as an existing metric (a built-in default or one of
their own customs). Duplicate names are confusing on tracked-data lists, dashboards,
and chart labels.

Per the ticket: when an athlete enters a name that already exists, warn them, give an
easy way to back out, and if they insist, the name gets a `(2)` (then `(3)`, ...) suffix.

## Scope

- **In scope:** name-collision detection and the inline warning + suffix flow in
  `CustomMetricForm`.
- **Out of scope:** the "custom" icon. `src/icons/custom-metric.svg` already renders for
  custom metrics in the tracked list (`SortableMetricRow`), `AddMetric`, and dashboard
  cards. That ticket bullet is already satisfied.

## Decisions

- **Warning UX:** inline warning under the Name field + **block submit** until resolved
  (not a modal `window.confirm`).
- **Check scope:** across **all** metric types (health, performance, competition), against
  **both** built-in defaults and the user's own custom metrics.
- **Matching:** case-insensitive and whitespace-trimmed.
- **"Insist" affordance:** a button in the warning that fills the Name field with the next
  available `(n)` suffixed name. Transparent: the field then shows the real final name and
  Save enables normally.
- **"Cancel the custom field":** satisfied by the form's existing **Cancel** button; no new
  control needed.

## Architecture

Two units.

### 1. Pure helper module — `src/utils/metricNameValidation.ts`

Fully unit-testable, no React.

- `normalizeMetricName(name: string): string` — `trim()` then `toLowerCase()`. The single
  source of truth for "are these the same name."
- `suggestUniqueName(desired: string, taken: Set<string>): string` — strips a trailing
  ` (n)` from `desired` to get the base, then returns `` `${base} (${k})` `` for the
  smallest `k >= 2` whose normalized form is not in `taken`.
  - "Hydration" with `{hydration}` -> "Hydration (2)"
  - "Hydration" with `{hydration, hydration (2)}` -> "Hydration (3)"
  - "Hydration (2)" with `{hydration, hydration (2)}` -> "Hydration (3)" (resolves off base)

`taken` is a set of **normalized** names. Callers normalize before lookup/insertion.

### 2. Wiring in `src/components/tracking/CustomMetricForm.tsx`

Data-gathering stays in the component, where all metric registries are already imported.

- A `useMemo` builds `takenNames: Set<string>` of normalized names from:
  - default-on registries: `HEALTH_METRICS`, `PERFORMANCE_METRICS`, `COMPETITION_METRICS`
  - addable registries: `ADDABLE_HEALTH`, `ADDABLE_PERFORMANCE`, `ADDABLE_COMPETITION`
  - the user's custom metrics from `useCustomMetrics()`
  - **excluding the metric currently being edited** (by `editing?.id`), so re-saving an
    unchanged name does not trip the check.
- Derived each render:
  - `trimmedName = draft.name.trim()`
  - `isDuplicate = trimmedName !== "" && takenNames.has(normalizeMetricName(trimmedName))`
  - `suggestion = isDuplicate ? suggestUniqueName(trimmedName, takenNames) : null`
- New inline block immediately after the Name `TextField` (around line 581), rendered with
  `<If condition={isDuplicate}>`:
  - a warning paragraph: `A metric named "<trimmedName>" already exists.`
  - a `type="button"` reading `Use "<suggestion>" instead` whose handler calls
    `update("name", suggestion)`.
- **Block submit:** the Save button gets `disabled={isDuplicate}` (this also suppresses
  Enter-key implicit submission), and `handleSubmit` gets a defensive early-return guard
  when `isDuplicate` is true.

## Data flow

Type name -> `isDuplicate`/`suggestion` recompute each render (cheap Set lookup) -> warning
+ suffix button render and Save is disabled -> user clicks the button (field becomes
`Hydration (2)`) or types a different name -> collision clears -> Save enables -> the
existing submit / `addMetric` / `updateMetric` path runs unchanged.

## Styling

One new CSS-module rule (e.g. `css.nameWarning`) for the warning text and its inline
button, visually distinct from the red `css.error` (this is a recoverable warning, not a
hard error). Vanilla CSS, no nesting, `clsx` for any conditional classes, per project
conventions.

## Edge cases

- Case-insensitive, trimmed matching (`hydration` matches `Hydration`).
- Empty name shows no warning; the existing "Name is required." submit check still applies.
- Edit mode excludes the metric's own name, so re-saving without a rename does not warn;
  renaming onto another existing name does warn.
- Suffix increments past already-taken `(n)` values.
- Known minor, intentionally **not** handled: a base name near the 128-char `NAME_MAX`
  could push a suffixed suggestion slightly over the limit. Not worth special-casing.

## Testing

- **Pure unit tests** for `metricNameValidation.ts`:
  - `normalizeMetricName`: trims and lowercases.
  - `suggestUniqueName`: base -> `(2)`; `(2)` taken -> `(3)`; strips an existing trailing
    `(n)` and resolves off the base; case-insensitive against `taken`.
- **Component tests** in the existing `CustomMetricForm` test file:
  - Typing a built-in name shows the warning and disables Save.
  - Clicking the suffix button fills the field with the suggestion, clears the warning, and
    re-enables Save.
  - Submit is blocked while colliding, then succeeds after resolution.
  - Edit mode: re-saving the metric's own unchanged name does not warn.
