# Primitive metric typing — design notes

Context for the upcoming work that (a) moves built-in metric definitions out of code into Firestore and (b) introduces categorical metrics alongside the existing numeric ones. These notes capture the design discussion from the DGT-53 conversation so we can start from a shared baseline.

## The three primitives

From measurement theory (Stevens' levels of measurement), three types cover the design space:

| Type | What it is | Storage | Aggregation | Chart axis |
|---|---|---|---|---|
| **Numeric** | Continuous number; the number itself is the data. | `number` | mean / sum / min / max | linear / log |
| **Ordinal** | Ordered finite set of labeled choices; each label has a numeric corollary representing its position/rank. | `number` (the numeric corollary) | median (mean defensible if equal spacing assumed) | linear (with label ticks) or categorical |
| **Nominal** | Unordered finite set of labels; no meaningful number. | `string` (the label) | mode / counts | categorical (bar per category) |

Examples in our domain:
- **Numeric**: sleep hours, protein grams, goals scored, miles run.
- **Ordinal**: Likert scales (mood, sleep quality), perceived exertion (Borg RPE 6-20), soreness 1-10, hydration cups 1-N (current implementation already is ordinal in disguise).
- **Nominal**: jersey color, position played, opponent name, sport type. Rare in this domain but worth supporting.

## Terminology resolution

- "Categorical" in casual usage covers both ordinal and nominal — ambiguous.
- The natural term for "string-valued with numeric corollary" is **ordinal**.
- Not all categoricals have meaningful numeric corollaries — nominal ones don't. Encoding "red=1, blue=2, green=3" is arithmetically valid but semantically empty: any reordering of the numbers preserves the data, which is the test for "no meaningful ordering."

## Two design paths considered

**A. Three types at the schema level:** `numeric | ordinal | nominal`.
- Clean type discrimination; readers branch on type without inspecting flags.
- Aggregation/chart/UI widget all derive from the type alone.

**B. Two types + tag:** `numeric | categorical` with `ordered: boolean` on categorical.
- Simpler primitive count.
- Readers everywhere have to branch on the flag → more places to forget the case.

**Decision: A.** Even if nominal use cases are rare today, naming the three primitives separately avoids a migration cost when nominal eventually shows up.

## UI pattern for metric creation

Schema uses the three primitives. The metric-creation UI hides the ordinal/nominal distinction behind a more concrete question.

**Step 1 — Type choice:** two big buttons, *Numeric* / *Categorical*.

**Step 2a — Numeric:** existing form (unit, min, max, default goal, chart range, etc.).

**Step 2b — Categorical:** a table with columns `Label` and `Value (optional)`.

```
+---------+----------------+
| Label   | Value (optional)|
+---------+----------------+
| Strongly Disagree |   1   |
| Disagree          |   2   |
| Neither           |   3   |
| Agree             |   4   |
| Strongly Agree    |   5   |
+---------+----------------+
[+ add row]   [Likert preset ▾]
```

- If user fills any value, all rows need one (enforce on submit) → saved as `ordinal`.
- If all values are blank → saved as `nominal`.
- Row reorder handle appears once values are filled (since order is meaningful).
- Footer note: "Filling in numeric values lets the app average, sort, and chart this metric numerically. Leave blank if the categories are unordered (e.g., position played)."

**Presets** (single-click templates that populate the table):
- *Likert 5-point*: Strongly Disagree=1 … Strongly Agree=5.
- *Likert 7-point*: same with finer gradation.
- *Frequency 5-point*: Never=1 … Always=5 (Likert-type, not strictly bipolar).
- *Yes/No*: two rows, Yes=1, No=0.
- *Custom* (default): empty table.

## Likert specifics

For reference / preset rationale:

- **Likert item**: single ordered rating, classically bipolar (Strongly Disagree ↔ Strongly Agree) and symmetric (equal positive/negative around a neutral midpoint). 5- or 7-point common; 4- or 6-point "forced choice" omits the neutral.
- **Likert scale** (strict): the sum or mean of *multiple* items measuring one latent construct. Not a single rating, despite colloquial usage.
- **Likert-type item**: same UI shape (ordered ratings) but not necessarily bipolar (e.g., frequency scales).
- Equal spacing is conventional but not required. Borg RPE (6-20) has unequal psychological intervals; the framework should accept any numbers, not just 1..N.

## Aggregation rules per type

- **Numeric**: mean / sum / min / max all valid.
- **Ordinal**: median is statistically safest. Mean is defensible if equal-spacing assumed (most Likert presets). Mode also useful.
- **Nominal**: mode / counts only. Mean meaningless.

The framework should set the default aggregation per type and let metric authors override (e.g., "this Likert metric should use mean, not median").

## Chart axis treatment per type

- **Numeric**: existing linear/log axis machinery.
- **Ordinal**: use the numeric corollary on a linear axis with label tick marks. Bars/points sit at the corresponding numeric position. Y-axis range derives from the value range (e.g., 1..5 for Likert).
- **Nominal**: categorical axis (one bar per category). No averaging; show counts or proportions.

## Open design questions

1. **Nominal → ordinal upgrade**: a user starts with a categorical metric, leaves values blank (nominal), then later wants to add numbers. Should this be an in-place upgrade (type changes nominal → ordinal, stored entries re-keyed by label → value)? Or require delete + recreate? Lean toward in-place but the migration needs thought.

2. **Stored shape for ordinal entries**: store the numeric value, the label, or both?
   - Storing the number is most compact and matches the type's "the number is the data" position.
   - Storing the label preserves human-readability if the metric definition changes (e.g., label rename).
   - Lean toward storing the number; labels are a property of the metric definition.
   - But: if the metric author renames a label or changes its numeric value, what happens to stored entries? Sketch a migration story.

3. **Nominal entries during the transition**: if we don't ship nominal in v1 of the categorical work, every categorical is implicitly ordinal — but the UI question "leave blank for unordered" implies a path. Decide whether v1 ships nominal or defers it.

4. **Forced-choice Likert** (even-point scales, no neutral): no schema distinction from odd-point — same primitive (ordinal). Question is whether to ship 4- and 6-point presets out of the gate.

5. **Where does aggregation period live?** Per-metric ("sum daily, average weekly") or global? Likely per-metric since "total hours slept this month" and "average mood this month" want different reductions on the same time period.

6. **CODAP export**: ordinal metrics export as the numeric corollary (matches current hydration behavior). Nominal exports as the string label. Need to decide whether ordinal also exports the label as a separate attribute (`mood_value`, `mood_label`).

## Migration considerations from current model

- Hydration currently stores 1..N as a number with implicit ordinal semantics. Under the new framework it becomes an explicit ordinal with a value table `Pale Yellow=1, ..., Dark Amber=N` (or however the prototype's labels go). Storage shape doesn't change; the metric definition gains a value table.
- The five other built-in numerics (sleepTime, sleepEfficiency, protein, leanMass, plus the various competition metrics) stay numeric.
- Availability is a tree-shaped composite — separate consideration. Not a single ordinal/nominal value.

## Naming watch-list

Words I've seen used in this space, with intended definitions:
- **Categorical**: unspecified umbrella. Avoid in code/schema; use ordinal or nominal.
- **Discrete**: usually a synonym for categorical in casual usage. Also avoid.
- **Enum**: programming term; broadly equivalent to nominal or ordinal depending on whether ordering is meaningful.
- **Ranked**: synonym for ordinal in some contexts; clearer in others (e.g., "ranked choice").
- **Continuous**: synonym for numeric in this design. Strictly numeric also includes counts, which are discrete-but-numeric.
- **Likert**: a SPECIFIC ordinal pattern (bipolar, symmetric). Not all ordinals are Likert.
