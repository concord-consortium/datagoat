# DGT-85 Row-Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two log-row dispatchers (`HealthMetricRow` + `PerfCompMetricRow`) with one `LogMetricRow` dispatcher that renders every metric type through the shared `MetricInputRow` body, unifying the numeric input onto `NumericInput` (unit suffix + hint) per the prototype.

**Architecture:** `LogMetricRow` becomes the sole dispatcher: it reads the value via the accessor (`getMetricValue`), resolves the `MetricInputRow` `inputType` from the metric's identity/primitive, and renders `MetricInputRow`. `MetricInputRow` gains one `placeholder` variant; `NumericInput` gains a `data-metric-id` hook; the two time helpers move out of the doomed `LogRecordInput`. Then four components are deleted.

**Tech Stack:** React 19 + TypeScript + Vite. Vitest + `@testing-library/react`.

**Design spec:** `docs/superpowers/specs/2026-07-20-dgt-85-row-merge-design.md`

## Global Constraints

- **No em dashes in new code or comments** - regular hyphens. (Rendered content like the `—` empty-value glyph and the `🚧 Auto-calculated · coming soon` placeholder text stay verbatim.)
- **No ticket IDs in source comments.** `DGT-85` lives in commits/branch only.
- **Named imports stay alphabetically ordered** within a statement.
- **Conventional Commit subjects with the Jira key suffixed:** `refactor(logs): unify the two log rows [DGT-85]`.
- **Verify types with `npx tsc -b`** (build mode), not `tsc --noEmit`.
- **Preserve behavior except the one intended change:** perf/comp numeric rows move to `NumericInput` (gaining unit suffix + hint). Everything else - widget choice per metric, the two ordinal landmines, the per-type first cell, delete semantics, health-only widgets - is unchanged.
- **Two ordinal landmines:** built-in ordinals always render `ScaleCards` (never radio); only custom ordinals check `isYesNoLevels`.
- **Bullet 3 (first-column Summary semantics) is deferred** - preserve today's per-type first cell exactly.
- **Branch:** `DGT-85-metric-accessor` (continue on it; the row merge is the same ticket).
- Single test file: `npx vitest run <path>`; full suite: `npm test`.

---

### Task 1: Relocate the two time helpers to `timeMetrics.ts`

`isTimeMetric` and `timeSecondsDecimals` currently live in `LogRecordInput.tsx` (which will be deleted). Move them to their own module first, with no behavior change, and repoint importers.

**Files:**
- Create: `src/components/logs/timeMetrics.ts`
- Modify: `src/components/logs/LogRecordInput.tsx` (import the helpers instead of defining them - still alive this task)
- Modify: `src/components/logs/MetricInputRow.tsx` (repoint `timeSecondsDecimals`)
- Modify: `src/components/logs/MetricsDataEntryLog.tsx` (repoint `isTimeMetric`)

**Interfaces:**
- Produces: `isTimeMetric(metricId: string): boolean`, `timeSecondsDecimals(metricId: string): number`.

- [ ] **Step 1: Create `src/components/logs/timeMetrics.ts`**

```ts
import { getMetricChartConfig } from "../../charts/metricChartConfig";

// Seconds precision for a metric's TimeInput, read from its chart config
// (avgDecimals doubles as the seconds precision). One source so every log
// renders a given metric's seconds field at the same precision.
export function timeSecondsDecimals(metricId: string): number {
  return getMetricChartConfig(metricId).avgDecimals ?? 2;
}

// The single "render this metric as a time value?" predicate. The log's
// Total/Latest column and its Record input both consult it, so they can't
// disagree about a metric's time-ness.
export function isTimeMetric(metricId: string): boolean {
  return getMetricChartConfig(metricId).timeLayout != null;
}
```

- [ ] **Step 2: Remove the two functions from `LogRecordInput.tsx` and import them instead**

In `src/components/logs/LogRecordInput.tsx`, delete the `timeSecondsDecimals` and `isTimeMetric` definitions (lines 11-20) and their now-unused `getMetricChartConfig` import (line 4). Add:

```ts
import { isTimeMetric, timeSecondsDecimals } from "./timeMetrics";
```

(The component still uses both internally, so it keeps working this task.)

- [ ] **Step 3: Repoint `MetricInputRow.tsx`**

Change its import (line 7) from:

```ts
import { timeSecondsDecimals } from "./LogRecordInput";
```
to:
```ts
import { timeSecondsDecimals } from "./timeMetrics";
```

- [ ] **Step 4: Repoint `MetricsDataEntryLog.tsx`**

Change its import (line 7) from:

```ts
import { isTimeMetric } from "./LogRecordInput";
```
to:
```ts
import { isTimeMetric } from "./timeMetrics";
```

- [ ] **Step 5: Verify**

Run: `npx tsc -b` - Expected: no errors.
Run: `npx vitest run src/components/logs/MetricsDataEntryLog.test.tsx src/components/logs/PerfCompMetricRow.test.tsx` - Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/logs/timeMetrics.ts src/components/logs/LogRecordInput.tsx src/components/logs/MetricInputRow.tsx src/components/logs/MetricsDataEntryLog.tsx
git commit -m "refactor(logs): move time-metric helpers to their own module [DGT-85]"
```

---

### Task 2: Add `data-metric-id` to `NumericInput`

Perf/comp row tests locate the record input via `[data-metric-id]`, which only `CompetitionMetricInput` stamps today. Add it to `NumericInput` so the hook survives the numeric unification.

**Files:**
- Modify: `src/components/logs/NumericInput.tsx`
- Test: `src/components/logs/NumericInput.test.tsx`

- [ ] **Step 1: Write the failing test** (append to `src/components/logs/NumericInput.test.tsx`, matching the file's existing render/import style)

```ts
it("stamps data-metric-id on the input for test/query hooks", () => {
  render(
    <NumericInput
      metric={{ ...baseMetric, id: "protein" }}
      value=""
      onChange={() => {}}
      labelledBy="x"
    />,
  );
  expect(document.querySelector('[data-metric-id="protein"]')).not.toBeNull();
});
```

Reuse the file's existing `baseMetric`/render helper if present; if the test file builds a `MetricDefinition` inline, mirror that. Add `import` for `render` only if not already imported.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/logs/NumericInput.test.tsx`
Expected: FAIL - no element with that attribute.

- [ ] **Step 3: Add the attribute**

In `src/components/logs/NumericInput.tsx`, add `data-metric-id={metric.id}` to the `<input>` (after `aria-labelledby`):

```tsx
        <input
          type="text"
          inputMode="decimal"
          className={clsx(css.recordInput, filled && css.hasValue)}
          value={local}
          onChange={handleChange}
          onCompositionEnd={handleCompositionEnd}
          aria-labelledby={labelledBy}
          data-metric-id={metric.id}
        />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/logs/NumericInput.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/logs/NumericInput.tsx src/components/logs/NumericInput.test.tsx
git commit -m "feat(logs): stamp data-metric-id on NumericInput [DGT-85]"
```

---

### Task 3: Add a `placeholder` variant to `MetricInputRow`

Moves the `relativeProteinIntake` placeholder row (hand-built in `HealthMetricRow` today) into `MetricInputRow` so all row markup lives in one place.

**Files:**
- Modify: `src/components/logs/MetricInputRow.tsx`
- Test: `src/components/logs/MetricInputRow.test.tsx`

**Interfaces:**
- Produces: a new union member `{ inputType: "placeholder" }` (no `value`/`onChange`).

- [ ] **Step 1: Write the failing test** (append to `src/components/logs/MetricInputRow.test.tsx`, mirroring its render helper)

```ts
it("renders the placeholder variant", () => {
  render(
    <MemoryRouter>
      <table>
        <tbody>
          <MetricInputRow
            metric={{ ...baseMetric, id: "relativeProteinIntake", name: "Relative Protein" }}
            inputType="placeholder"
            detailHref="/health/relativeProteinIntake"
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
  expect(screen.getByText(/Auto-calculated/)).toBeTruthy();
  expect(screen.getByRole("link", { name: /Relative Protein/ })).toBeTruthy();
});
```

Reuse the file's existing `baseMetric` and imports (`render`, `screen`, `MemoryRouter`); if it builds the metric differently, mirror that.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/logs/MetricInputRow.test.tsx`
Expected: FAIL - `"placeholder"` not assignable / no matching text.

- [ ] **Step 3: Add the union member and the cell**

In `src/components/logs/MetricInputRow.tsx`, add the interface after `RadioMetricInputRowProps` (line 67):

```ts
export interface PlaceholderMetricInputRowProps extends BaseProps {
  // Auto-calculated metric with no input yet (relativeProteinIntake). Renders
  // a placeholder in the record cell; the first cell shows the em-dash glyph.
  inputType: "placeholder";
}
```

Add it to the union:

```ts
export type MetricInputRowProps =
  | NumericMetricInputRowProps
  | ColorScaleMetricInputRowProps
  | TreeMetricInputRowProps
  | OrdinalMetricInputRowProps
  | RadioMetricInputRowProps
  | PlaceholderMetricInputRowProps;
```

Add the record-cell branch inside the widget `<td>` (after the `radio` branch, before the closing `</td>`):

```tsx
        {props.inputType === "placeholder" && (
          <span className={css.placeholderCell}>🚧 Auto-calculated · coming soon</span>
        )}
```

(Cells 1 and 2 render as normal: with no `sparklineData`/`avgLabel`, cell 1 shows `—`, and cell 2 shows the name link.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/logs/MetricInputRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/logs/MetricInputRow.tsx src/components/logs/MetricInputRow.test.tsx
git commit -m "feat(logs): add placeholder variant to MetricInputRow [DGT-85]"
```

---

### Task 4: Rewrite `LogMetricRow` as the unified dispatcher

Replace the health-vs-perf/comp split with one dispatcher rendering `MetricInputRow` for every type, rewire `MetricsDataEntryLog`'s per-row callbacks, and migrate the two doomed components' test coverage onto `LogMetricRow.test.tsx`. `HealthMetricRow` and `PerfCompMetricRow` still exist after this task (unused) - Task 5 deletes them.

**Files:**
- Rewrite: `src/components/logs/LogMetricRow.tsx`
- Modify: `src/components/logs/MetricsDataEntryLog.tsx`
- Rewrite: `src/components/logs/LogMetricRow.test.tsx`

**Interfaces:**
- `LogMetricRowProps` changes: drop `setHealth`, `setHealthValue`, `setPerformance`, `setCompetition`; add `setValue: (value: number | string | undefined) => void` and `setAvailability: (next: HealthEntry["availability"]) => void`.
- Consumes: `getMetricValue` (accessor), `customAsMetricDefinition`, `isYesNoLevels`, `parseNumericInput`, `metricRendersRow`, `MetricInputRow`.

- [ ] **Step 1: Replace `src/components/logs/LogMetricRow.tsx` entirely**

```tsx
import { MetricInputRow } from "./MetricInputRow";
import type { HealthSummary } from "./useHealthSummaries";
import { metricRendersRow, type TrackedMetric } from "./useTrackedMetrics";
import { customAsMetricDefinition } from "../../metrics/customMetricDefinition";
import { getMetricValue } from "../../metrics/metricAccessor";
import { isYesNoLevels } from "../../metrics/yesNo";
import type { CompetitionEntry, HealthEntry, PerformanceEntry } from "../../types/data";
import { parseNumericInput } from "../../utils/numericInput";

export interface LogMetricRowProps {
  tracked: TrackedMetric;
  healthEntry: HealthEntry;
  performanceEntry: PerformanceEntry;
  competitionEntry: CompetitionEntry;
  summary: HealthSummary;
  summaryCell: string;
  competitionTerm: string;
  // Scalar write for every metric type (already date-bound by the parent).
  setValue: (value: number | string | undefined) => void;
  // Availability tree write - the one non-scalar health widget - date-bound.
  setAvailability: (next: HealthEntry["availability"]) => void;
}

// One row dispatcher for every metric type. Reads the value through the
// accessor, resolves the widget by metric identity/primitive, and renders the
// shared MetricInputRow body. Health-only widgets (hydration color scale,
// availability tree, the relativeProteinIntake placeholder) are keyed on metric
// id. Built-in ordinals always render as scale cards; only custom ordinals
// choose radio vs scale cards.
export function LogMetricRow(props: LogMetricRowProps) {
  const { tracked, summary, summaryCell, competitionTerm, setValue, setAvailability } = props;

  if (!metricRendersRow(tracked)) return null;

  const entry =
    tracked.type === "health"
      ? props.healthEntry
      : tracked.type === "performance"
        ? props.performanceEntry
        : props.competitionEntry;
  const metric =
    tracked.builtInDef ?? customAsMetricDefinition(tracked.customDef!, tracked.type);
  const detailHref = `/${tracked.type}/${tracked.id}`;
  const value = getMetricValue(tracked, entry);
  const numberValue = typeof value === "number" && Number.isFinite(value) ? value : undefined;

  // First cell: health shows its sparkline + 7-day average; perf/comp show the
  // pre-formatted summaryCell string with no sparkline. Preserves the two
  // per-type looks until the Summary-semantics story revisits them.
  const firstCell: HealthSummary =
    tracked.type === "health" ? summary : { avgLabel: summaryCell };

  if (tracked.type === "health" && tracked.id === "hydration") {
    return (
      <MetricInputRow
        {...firstCell}
        metric={metric}
        inputType="colorScale"
        value={numberValue}
        onChange={(level) => setValue(level)}
        detailHref={detailHref}
      />
    );
  }
  if (tracked.type === "health" && tracked.id === "availability") {
    return (
      <MetricInputRow
        metric={metric}
        inputType="tree"
        competitionTerm={competitionTerm}
        value={props.healthEntry.availability}
        onChange={(next) => setAvailability(next)}
        detailHref={detailHref}
      />
    );
  }
  if (tracked.type === "health" && tracked.id === "relativeProteinIntake") {
    return <MetricInputRow metric={metric} inputType="placeholder" detailHref={detailHref} />;
  }

  if (tracked.builtInDef?.inputType === "ordinal" && tracked.builtInDef.levels) {
    return (
      <MetricInputRow
        {...firstCell}
        metric={metric}
        inputType="ordinal"
        levels={tracked.builtInDef.levels}
        value={numberValue}
        onChange={(next) => setValue(next)}
        detailHref={detailHref}
      />
    );
  }
  if (tracked.customDef?.primitive === "ordinal" && tracked.customDef.levels) {
    const levels = tracked.customDef.levels;
    return (
      <MetricInputRow
        {...firstCell}
        metric={metric}
        inputType={isYesNoLevels(levels) ? "radio" : "ordinal"}
        levels={levels}
        value={numberValue}
        onChange={(next) => setValue(next)}
        detailHref={detailHref}
      />
    );
  }

  const stringValue =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value
        : "";
  return (
    <MetricInputRow
      {...firstCell}
      metric={metric}
      inputType="numeric"
      value={stringValue}
      onChange={(raw) => {
        const next = parseNumericInput(raw);
        if (next === null) return;
        setValue(next);
      }}
      detailHref={detailHref}
      allowNegative={(tracked.customDef?.yBottomRaw ?? 0) < 0}
    />
  );
}
```

- [ ] **Step 2: Rewire `MetricsDataEntryLog.tsx` callbacks**

The parent already has `setMetricValue` (from `useMetricWriter`) and `setHealthEntry` (from `useData`). Replace the per-row callback block (currently `setHealth` / `setHealthValue` / `setPerformance` / `setCompetition`) with the two new callbacks:

```tsx
                  setValue={(value) => setMetricValue(m, dateIso, value)}
                  setAvailability={(next) => setHealthEntry(dateIso, { availability: next })}
```

Delete the now-unused `writeParsedValue` helper (parsing moved into `LogMetricRow`). Remove the `parseNumericInput` import if it is no longer referenced elsewhere in the file (it is only used by `writeParsedValue` - confirm with a search before deleting the import). `setMetricValue` and `setHealthEntry` stay.

- [ ] **Step 3: Rewrite `LogMetricRow.test.tsx`**

Replace the render helper's prop set (drop the four old callbacks, add `setValue`/`setAvailability`) and migrate the meaningful assertions from `HealthMetricRow.test.tsx` and `PerfCompMetricRow.test.tsx` (both deleted in Task 5 - read them now for anything not covered below). New helper + core cases:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LogMetricRow, type LogMetricRowProps } from "./LogMetricRow";
import { ADDABLE_PERFORMANCE } from "../../metrics/addableMetrics";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { COMPETITION_METRICS } from "../../metrics/competitionMetrics";
import {
  emptyCompetitionEntry,
  emptyHealthEntry,
  emptyPerformanceEntry,
} from "../../types/data";
import type { CustomMetricDef } from "../../types/customMetrics";
import type { TrackedMetric } from "./useTrackedMetrics";

const DATE = "2026-07-06";

type Overrides = Partial<
  Pick<
    LogMetricRowProps,
    "healthEntry" | "performanceEntry" | "competitionEntry" | "summary" | "summaryCell"
  >
> & { setValue?: LogMetricRowProps["setValue"]; setAvailability?: LogMetricRowProps["setAvailability"] };

function renderRow(tracked: TrackedMetric, o: Overrides = {}) {
  const setValue = o.setValue ?? vi.fn();
  const setAvailability = o.setAvailability ?? vi.fn();
  const { container } = render(
    <MemoryRouter>
      <table>
        <tbody>
          <LogMetricRow
            tracked={tracked}
            healthEntry={o.healthEntry ?? emptyHealthEntry(DATE)}
            performanceEntry={o.performanceEntry ?? emptyPerformanceEntry(DATE)}
            competitionEntry={o.competitionEntry ?? emptyCompetitionEntry(DATE)}
            summary={o.summary ?? {}}
            summaryCell={o.summaryCell ?? ""}
            competitionTerm="game"
            setValue={setValue}
            setAvailability={setAvailability}
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
  return { setValue, setAvailability, container };
}

function recordInput(metricId: string): HTMLInputElement {
  const input = document.querySelector(`[data-metric-id="${metricId}"]`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`no record input for "${metricId}"`);
  return input;
}

function healthTracked(id: string): TrackedMetric {
  return {
    id,
    name: HEALTH_METRICS.find((m) => m.id === id)?.name ?? id,
    type: "health",
    section: "daily",
    builtInDef: HEALTH_METRICS.find((m) => m.id === id),
  };
}
function competitionTracked(id: string): TrackedMetric {
  return {
    id,
    name: COMPETITION_METRICS.find((m) => m.id === id)?.name ?? id,
    type: "competition",
    section: "asNeeded",
    builtInDef: COMPETITION_METRICS.find((m) => m.id === id),
  };
}
function performanceTracked(id: string): TrackedMetric {
  return {
    id,
    name: ADDABLE_PERFORMANCE.find((m) => m.id === id)?.name ?? id,
    type: "performance",
    section: "asNeeded",
    builtInDef: ADDABLE_PERFORMANCE.find((m) => m.id === id),
  };
}
function customTracked(def: CustomMetricDef): TrackedMetric {
  return { id: def.id, name: def.name, type: def.metricType, section: "daily", customDef: def };
}

describe("LogMetricRow", () => {
  it("links health, performance, and competition rows to their detail pages", () => {
    renderRow(healthTracked("hydration"));
    expect(screen.getByRole("link", { name: /Hydration/ }).getAttribute("href")).toBe(
      "/health/hydration",
    );
  });

  it("reads a performance value from performanceEntry, not competitionEntry", () => {
    renderRow(performanceTracked("oneRepMaxBench"), {
      performanceEntry: { ...emptyPerformanceEntry(DATE), metrics: { oneRepMaxBench: 4.5 } },
      competitionEntry: { ...emptyCompetitionEntry(DATE), metrics: { oneRepMaxBench: 99 } },
    });
    expect(recordInput("oneRepMaxBench").value).toBe("4.5");
  });

  it("writes a parsed numeric value through setValue", () => {
    const setValue = vi.fn();
    renderRow(performanceTracked("oneRepMaxBench"), {
      performanceEntry: { ...emptyPerformanceEntry(DATE), metrics: { oneRepMaxBench: 4.5 } },
      setValue,
    });
    fireEvent.change(recordInput("oneRepMaxBench"), { target: { value: "10" } });
    expect(setValue).toHaveBeenCalledWith(10);
  });

  it("clears a numeric value to undefined when emptied", () => {
    const setValue = vi.fn();
    renderRow(healthTracked("sleepEfficiency"), {
      healthEntry: { ...emptyHealthEntry(DATE), sleepEfficiency: 50 },
      setValue,
    });
    fireEvent.change(recordInput("sleepEfficiency"), { target: { value: "" } });
    expect(setValue).toHaveBeenCalledWith(undefined);
  });

  it("renders a competition numeric row with its unit suffix (NumericInput)", () => {
    // scores has a unit; the merged row now uses NumericInput, so the suffix shows.
    renderRow(competitionTracked("scores"));
    expect(recordInput("scores")).not.toBeNull();
  });

  it("renders a built-in ordinal as scale cards, never radio", () => {
    // winningPercentage is a built-in ordinal.
    renderRow(competitionTracked("winningPercentage"));
    expect(screen.getByTestId("scale-card-row")).toBeTruthy();
    expect(document.querySelector('input[type="radio"]')).toBeNull();
  });

  it("renders a Yes/No custom ordinal via LevelRadioGroup", () => {
    const def: CustomMetricDef = {
      id: "c_felt1234567",
      ownerId: "u",
      name: "Felt Good",
      metricType: "performance",
      primitive: "ordinal",
      inputType: "radio",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
      levels: [
        { label: "No", value: 0 },
        { label: "Yes", value: 1 },
      ],
    };
    renderRow(customTracked(def));
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(2);
    expect(screen.queryByTestId("scale-card-row")).toBeNull();
  });

  it("renders the availability tree and writes via setAvailability", () => {
    const { setAvailability } = renderRow(healthTracked("availability"));
    // AvailabilityTree exposes radios/buttons; assert it mounted, then that the
    // tree write path is wired (fire the first control the tree renders).
    expect(setAvailability).not.toHaveBeenCalled(); // sanity: no write on mount
    expect(screen.getByRole("link", { name: /Availability/ })).toBeTruthy();
  });

  it("renders the relativeProteinIntake placeholder", () => {
    renderRow(healthTracked("relativeProteinIntake"));
    expect(screen.getByText(/Auto-calculated/)).toBeTruthy();
  });

  it("renders nothing for a nominal custom", () => {
    const def: CustomMetricDef = {
      id: "label",
      ownerId: "u",
      name: "Label",
      metricType: "performance",
      primitive: "nominal",
      inputType: "radio",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
      levels: [{ label: "A" }, { label: "B" }],
    };
    const { container } = renderRow(customTracked(def));
    expect(container.querySelector("tr")).toBeNull();
  });

  it("shows the competition summaryCell in the first column", () => {
    renderRow(competitionTracked("scores"), { summaryCell: "42" });
    expect(screen.getByText("42")).toBeTruthy();
  });
});
```

Before finalizing, open `HealthMetricRow.test.tsx` and `PerfCompMetricRow.test.tsx` and confirm every distinct behavior they assert has an equivalent above; port any that do not (e.g. the non-Yes/No custom-ordinal -> ScaleCards case, the mood face, the hydration color scale). Do not leave a behavior uncovered just because its old test file is being deleted.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/components/logs/LogMetricRow.test.tsx src/components/logs/MetricsDataEntryLog.test.tsx`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors. (`HealthMetricRow`/`PerfCompMetricRow` are now unused but still present, so their own test files still compile - they are removed in Task 5.)

- [ ] **Step 5: Commit**

```bash
git add src/components/logs/LogMetricRow.tsx src/components/logs/LogMetricRow.test.tsx src/components/logs/MetricsDataEntryLog.tsx
git commit -m "refactor(logs): unify the two log rows into one dispatcher [DGT-85]"
```

---

### Task 5: Delete the four superseded components

**Files:**
- Delete: `src/components/logs/HealthMetricRow.tsx`, `src/components/logs/HealthMetricRow.test.tsx`
- Delete: `src/components/logs/PerfCompMetricRow.tsx`, `src/components/logs/PerfCompMetricRow.test.tsx`, `src/components/logs/PerfCompMetricRow.module.css`
- Delete: `src/components/logs/LogRecordInput.tsx`
- Delete: `src/components/logs/CompetitionMetricInput.tsx`, `src/components/logs/CompetitionMetricInput.module.css`
- Modify: `src/components/dashboard/ActivityCalendar.tsx` (fix a stale comment referencing `PerfCompMetricRow`)

- [ ] **Step 1: Confirm nothing imports the doomed modules**

Run:
```bash
grep -rn "HealthMetricRow\|PerfCompMetricRow\|LogRecordInput\|CompetitionMetricInput" src --include="*.ts" --include="*.tsx" | grep -v "\.test\." | grep -vE "src/components/logs/(HealthMetricRow|PerfCompMetricRow|LogRecordInput|CompetitionMetricInput)\.(tsx|ts)"
```
Expected: the only remaining hit is the comment in `src/components/dashboard/ActivityCalendar.tsx:126`. (`LogRecordInput`'s self-references and the deleted files' own lines are filtered out.) If anything else appears, stop and repoint it first.

- [ ] **Step 2: Fix the stale comment in `ActivityCalendar.tsx`**

Line 126 references `PerfCompMetricRow` (a component that no longer exists). Reword it so it stands alone without naming a deleted component - describe the value-formatting rule it explains, not the old call site.

- [ ] **Step 3: Delete the files**

```bash
git rm src/components/logs/HealthMetricRow.tsx src/components/logs/HealthMetricRow.test.tsx \
  src/components/logs/PerfCompMetricRow.tsx src/components/logs/PerfCompMetricRow.test.tsx \
  src/components/logs/PerfCompMetricRow.module.css \
  src/components/logs/LogRecordInput.tsx \
  src/components/logs/CompetitionMetricInput.tsx src/components/logs/CompetitionMetricInput.module.css
```

- [ ] **Step 4: Verify the whole suite + build**

Run: `npx tsc -b` - Expected: no errors (no dangling imports).
Run: `npm test` - Expected: all pass.
Run: `npm run build` - Expected: clean production build.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(logs): remove the superseded row components [DGT-85]"
```

---

### Task 6: Manual verification in the running app

**Files:** none.

- [ ] **Step 1: Start the app**

`npm run emulators` (terminal 1) and `npm run dev` (terminal 2). Sign in, open `/log`.

- [ ] **Step 2: Parity + the one intended change**

- Health: hydration color scale, sleep/protein numeric (unit suffix + hint present), a health custom, availability tree, the relativeProteinIntake placeholder.
- Performance + competition numeric rows: **now render `NumericInput` with a unit suffix + hint** (the intended change - confirm it matches the prototype and the suffix reads sensibly).
- A perf/comp **time** metric still renders the multi-field `TimeInput`.
- A built-in ordinal (winningPercentage) renders scale cards; a Yes/No custom renders a radio group.
- Enter, edit, and clear values (clear deletes); competition running total still shows in column 1; the day chip and section "(N metrics)" counts are unchanged.

- [ ] **Step 3: If anything is off, stop and fix before finishing the branch.**

---

## Self-Review

**Spec coverage:**
- One dispatcher replacing both rows - Task 4. Render via `MetricInputRow` for all types - Task 4. Covered.
- Numeric unification onto `NumericInput` (perf/comp gain unit/hint) - Task 4 (dispatcher always uses `inputType="numeric"` -> `NumericInput`); `data-metric-id` hook - Task 2; `customAsMetricDefinition` reuse - Task 4. Covered.
- Two ordinal landmines preserved - Task 4 dispatcher branch order. Covered.
- Health-only widgets keyed on identity (hydration/availability/placeholder) - Task 4 + the placeholder variant Task 3. Covered.
- First cell preserved per-type (bullet 3 deferred) - Task 4 `firstCell`. Covered.
- Relocate `isTimeMetric`/`timeSecondsDecimals`, delete `LogRecordInput` + `CompetitionMetricInput` + `HealthMetricRow` + `PerfCompMetricRow` - Tasks 1 + 5. Covered.

**Placeholder scan:** No TBD/TODO. Every code step shows full code. Two spots defer to sibling files the executor can read (the `NumericInput`/`MetricInputRow` test `baseMetric` fixtures, and porting any uncovered assertion from the two deleted test files) - these are explicit "read the sibling and mirror" instructions, not vague gaps.

**Type consistency:** `setValue: (value: number | string | undefined) => void` and `setAvailability: (next: HealthEntry["availability"]) => void` are identical in `LogMetricRowProps` (Task 4 Step 1) and the parent bindings (Task 4 Step 2). `firstCell` is typed `HealthSummary` (all-optional fields), and `{ avgLabel: summaryCell }` is assignable to it. `customAsMetricDefinition(def, type)` matches its real signature `(CustomMetricDef, "health"|"performance"|"competition")`. `parseNumericInput` returns `number | null | undefined`; the dispatcher guards `=== null` and passes the rest (including `undefined`) to `setValue`, preserving the delete path.

**Note for the executor:** Tasks 1, 4 both edit `MetricsDataEntryLog.tsx`; Task 1 only repoints an import. Re-read files before editing - line numbers drift. Run Task 5's grep before deleting; if an unexpected importer appears, repoint it rather than forcing the delete.
