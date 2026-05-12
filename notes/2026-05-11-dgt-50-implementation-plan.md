# DGT-50 — Non-numeric custom metric types: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the direction-of-travel slice of non-numeric custom metrics (schema + form + log input for ordinal customs and a Y/N preset) in time for the 2026-05-12 partner demo.

**Architecture:** Add a `primitive: "numeric" | "ordinal" | "nominal"` discriminator and a `levels` array to `CustomMetricDef`. The form gains a three-button type chooser (Numeric / Categorical / Y/N) and a levels table sub-component for Categorical. The log renders ordinal customs as a horizontal radio group keyed off levels. Y-axis range for ordinals is derived from levels at save-time so the chart engine needs no changes. No migration: DB will be cleared before demo, `primitive` is required, no read-time defaults.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + jsdom + @testing-library/react, CSS Modules, Firebase Firestore.

**Spec:** `notes/2026-05-11-dgt-50-schema-design.md`.
**Companion notes:** `notes/primitive-metric-typing.md`.

---

## File structure

**New files:**
- `src/components/tracking/CustomMetricLevelsEditor.tsx` — table UI for adding/editing/removing levels.
- `src/components/tracking/CustomMetricLevelsEditor.module.css` — styles for the table.
- `src/components/tracking/CustomMetricLevelsEditor.test.tsx` — behavior tests for the editor.

**Modified files:**
- `src/types/customMetrics.ts` — add `CustomMetricPrimitive`, `CustomMetricLevel`; add `primitive` (required) and `levels` (optional) to `CustomMetricDef`; mark numeric-only fields optional.
- `src/contexts/CustomMetricsContext.tsx` — read/write `primitive` and `levels`; reject invalid `primitive` values from Firestore reads.
- `src/components/tracking/CustomMetricForm.tsx` — three-button top-level chooser; conditional rendering of levels editor; conditional field greying; submit-time level validation + y-range derivation; edit-mode top-level button inference.
- `src/components/tracking/CustomMetricForm.module.css` — styles for the type chooser row, conditional disabled state.
- `src/components/tracking/CustomMetricForm.test.tsx` — new cases covering Categorical create, Y/N create, edit-mode inference, validation, derived y-range.
- `src/components/logs/MetricInputRow.tsx` — new `inputType: "ordinal"` branch rendering a radio group.
- `src/components/logs/MetricInputRow.module.css` — styles for the radio group.
- `src/components/logs/MetricInputRow.test.tsx` — tests for the ordinal branch.
- `src/components/logs/HealthLog.tsx` — pass `primitive`/`levels` for custom rows.
- `src/components/logs/CompetitionLog.tsx` — same plumbing.

**Not modified (intentional):**
- `src/charts/*` — save-time y-range derivation means chart engine is untouched.
- `src/types/data.ts` — entry storage already typed `Record<string, number | string | undefined>`.
- `src/migrations/*` — no migration; DB will be cleared before demo.

---

## Task 0: Branch setup and demo prerequisite

This branch should ship in time for the 2026-05-12 partner demo. The DGT-53 (zero-as-valid) branch is in code review at session start; pick a base branch deliberately.

- [ ] **Step 1: Decide base branch**

If DGT-53 is merged to `main` by the time you start this task → branch from `main`.
If DGT-53 is *not* merged → branch from `DGT-53-zero-as-valid-metric` to inherit the zero-fixes. Note in PR description that DGT-50 stacks on DGT-53.

- [ ] **Step 2: Create the branch**

```bash
git fetch origin
# If DGT-53 has merged:
git checkout -b DGT-50-non-numeric-customs origin/main
# Else:
git checkout DGT-53-zero-as-valid-metric
git pull
git checkout -b DGT-50-non-numeric-customs
```

- [ ] **Step 3: Confirm clean working tree and tests pass**

```bash
git status   # expect "nothing to commit, working tree clean"
npm test     # expect all tests pass
```

- [ ] **Step 4: Prerequisite — confirm DB will be cleared before demo**

Per design decision: no migration, no backward-looking code. Confirm with Leslie/Bill before merging that the demo will start from a cleared DB. If they push back and want existing customs preserved, you'll need to add read-time defaulting for `primitive` (an extra task we'd insert before Task 2). Don't write that code unless required.

---

## Task 1: Extend `CustomMetricDef` type

**Files:**
- Modify: `src/types/customMetrics.ts`

- [ ] **Step 1: Write the failing type-level test**

Append to `src/types/customMetrics.ts` is wrong — types don't have runtime tests, but we can add a compile-time fixture. Create `src/types/customMetrics.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expectTypeOf } from "vitest";
import type {
  CustomMetricDef,
  CustomMetricLevel,
  CustomMetricPrimitive,
} from "./customMetrics";

describe("CustomMetricDef", () => {
  it("accepts a numeric primitive without levels", () => {
    const def: CustomMetricDef = {
      id: "c_a",
      ownerId: "u1",
      name: "Steps",
      metricType: "health",
      primitive: "numeric",
      unit: "steps",
      goalRaw: 10000,
      yTopRaw: 20000,
      yBottomRaw: 0,
      avgDecimals: 0,
      inputType: "numeric",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    };
    expectTypeOf(def.primitive).toEqualTypeOf<CustomMetricPrimitive>();
  });

  it("accepts an ordinal primitive with levels", () => {
    const def: CustomMetricDef = {
      id: "c_b",
      ownerId: "u1",
      name: "Mood",
      metricType: "health",
      primitive: "ordinal",
      levels: [
        { label: "Low", value: 1 },
        { label: "Medium", value: 2 },
        { label: "High", value: 3 },
      ],
      yTopRaw: 3,
      yBottomRaw: 1,
      avgDecimals: 1,
      inputType: "radio",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    };
    expectTypeOf(def.levels).toEqualTypeOf<CustomMetricLevel[] | undefined>();
  });

  it("allows nominal levels with omitted value", () => {
    const lvl: CustomMetricLevel = { label: "Red", color: "#f00" };
    expectTypeOf(lvl.value).toEqualTypeOf<number | undefined>();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/types/customMetrics.test.ts
```

Expected: type-check failure on `primitive`, `levels`, and `CustomMetricLevel` (don't exist yet).

- [ ] **Step 3: Update the type**

Replace `src/types/customMetrics.ts` contents with:

```typescript
export type CustomMetricType = "health" | "competition";

// `inputType` is orthogonal to `primitive`. Today numeric metrics render
// as "numeric" and ordinal metrics render as "radio"; a future story can
// add a "menu" / "select" widget by extending this union without
// touching the primitive enum.
export type CustomMetricInputType = "numeric" | "radio";

export type CustomMetricPrimitive = "numeric" | "ordinal" | "nominal";

export interface CustomMetricLevel {
  label: string;
  // Present => ordinal level (numeric corollary). Absent => nominal
  // level (no meaningful number). The form enforces "all-or-none"
  // per metric: every level in an ordinal metric carries a value,
  // and every level in a nominal metric omits it.
  value?: number;
  // Optional color swatch. Saved when the user fills it in; the log
  // row for ordinal customs ignores it for v1 (radio rendering).
  // Reserved for a follow-up that adds the color-swatch input path.
  color?: string;
}

export interface CustomMetricDef {
  id: string;
  ownerId: string;
  name: string;
  metricType: CustomMetricType;
  primitive: CustomMetricPrimitive;

  // Numeric-only config. Required when primitive === "numeric"; for
  // ordinal customs, `goalRaw`/`avgDecimals` stay meaningful, and
  // `yTopRaw`/`yBottomRaw` are derived from levels at save-time so
  // the chart engine reads them like always. `unit` is meaningless
  // for non-numeric primitives.
  unit?: string;
  goalRaw?: number;
  yTopRaw?: number;
  yBottomRaw?: number;
  avgDecimals?: number;

  // Categorical config; required when primitive ∈ {"ordinal", "nominal"};
  // omitted for "numeric". Order is meaningful for ordinal (matches
  // ascending `value`); incidental for nominal.
  levels?: CustomMetricLevel[];

  inputType: CustomMetricInputType;
  referenceUrl: string;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/types/customMetrics.test.ts
```

Expected: pass.

- [ ] **Step 5: Run the full type check**

```bash
npx tsc --noEmit
```

Expected: many errors (existing call sites pass numeric-only fields without `primitive`). Don't fix them yet — Task 2 onward fix the callers. The point of this step is to take an inventory of how many places we'll touch downstream.

- [ ] **Step 6: Commit**

```bash
git add src/types/customMetrics.ts src/types/customMetrics.test.ts
git commit -m "feat(types): add CustomMetricPrimitive + levels to CustomMetricDef [DGT-50]"
```

---

## Task 2: Update `CustomMetricsContext` to read/write `primitive` and `levels`

**Files:**
- Modify: `src/contexts/CustomMetricsContext.tsx`
- Modify: `src/contexts/CustomMetricsContext.test.tsx` (or create — check `ls src/contexts/*.test.tsx` first).

- [ ] **Step 1: Inspect existing context tests**

```bash
ls src/contexts/CustomMetricsContext.test.tsx 2>/dev/null && head -50 src/contexts/CustomMetricsContext.test.tsx
```

If the file exists, append to it. If not, create it following the mock pattern from `src/components/tracking/CustomMetricForm.test.tsx:1-80`. The remaining steps assume the file exists.

- [ ] **Step 2: Write the failing test for `fromDoc` reading `primitive` and `levels`**

Add to the test file:

```typescript
import { describe, it, expect } from "vitest";
// fromDoc is currently file-local; export it for testing if it isn't already.
import { fromDoc } from "./CustomMetricsContext";

describe("CustomMetricsContext.fromDoc", () => {
  it("reads primitive='ordinal' with a levels array", () => {
    const def = fromDoc("c_x", {
      ownerId: "u1",
      name: "Mood",
      metricType: "health",
      primitive: "ordinal",
      levels: [
        { label: "Low", value: 1 },
        { label: "High", value: 3 },
      ],
      yTopRaw: 3,
      yBottomRaw: 1,
      avgDecimals: 1,
      inputType: "radio",
      referenceUrl: "",
    });
    expect(def.primitive).toBe("ordinal");
    expect(def.levels).toEqual([
      { label: "Low", value: 1 },
      { label: "High", value: 3 },
    ]);
  });

  it("reads primitive='numeric' without levels", () => {
    const def = fromDoc("c_y", {
      ownerId: "u1",
      name: "Steps",
      metricType: "health",
      primitive: "numeric",
      unit: "steps",
      goalRaw: 10000,
      yTopRaw: 20000,
      yBottomRaw: 0,
      avgDecimals: 0,
      inputType: "numeric",
      referenceUrl: "",
    });
    expect(def.primitive).toBe("numeric");
    expect(def.levels).toBeUndefined();
  });

  it("throws on an unknown primitive value", () => {
    expect(() =>
      fromDoc("c_z", {
        ownerId: "u1",
        name: "Bogus",
        metricType: "health",
        primitive: "garbage",
        inputType: "numeric",
        referenceUrl: "",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run src/contexts/CustomMetricsContext.test.tsx
```

Expected: fail. Either `fromDoc` isn't exported, or `primitive`/`levels` aren't being read.

- [ ] **Step 4: Update `fromDoc` and the writer paths**

In `src/contexts/CustomMetricsContext.tsx`:

1. Export `fromDoc` (`export function fromDoc...`).
2. Add the primitive/levels reads:

```typescript
function readPrimitive(raw: unknown): CustomMetricPrimitive {
  if (raw === "numeric" || raw === "ordinal" || raw === "nominal") return raw;
  // Per spec: DB is cleared before demo so primitive is always written
  // by the form. A missing/invalid value indicates a corrupt doc or a
  // schema-drift we don't yet handle - fail loud rather than silently
  // coerce.
  throw new Error(`CustomMetricDef: invalid primitive value '${String(raw)}'`);
}

function readLevels(raw: unknown): CustomMetricLevel[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error("CustomMetricDef: levels must be an array");
  }
  return raw.map((r, i) => {
    if (typeof r !== "object" || r === null) {
      throw new Error(`CustomMetricDef: level ${i} is not an object`);
    }
    const row = r as Record<string, unknown>;
    if (typeof row.label !== "string") {
      throw new Error(`CustomMetricDef: level ${i} missing label`);
    }
    const level: CustomMetricLevel = { label: row.label };
    if (row.value !== undefined) {
      if (typeof row.value !== "number" || !Number.isFinite(row.value)) {
        throw new Error(`CustomMetricDef: level ${i} value not finite`);
      }
      level.value = row.value;
    }
    if (row.color !== undefined) {
      if (typeof row.color !== "string") {
        throw new Error(`CustomMetricDef: level ${i} color not string`);
      }
      level.color = row.color;
    }
    return level;
  });
}
```

3. Wire them into the existing `fromDoc`:

```typescript
export function fromDoc(id: string, data: Record<string, unknown>): CustomMetricDef {
  return {
    id,
    ownerId: String(data.ownerId ?? ""),
    name: String(data.name ?? ""),
    metricType: data.metricType === "competition" ? "competition" : "health",
    primitive: readPrimitive(data.primitive),
    inputType: data.inputType === "radio" ? "radio" : "numeric",
    unit: data.unit === undefined ? undefined : String(data.unit),
    goalRaw: data.goalRaw === undefined ? undefined : Number(data.goalRaw),
    yTopRaw: data.yTopRaw === undefined ? undefined : Number(data.yTopRaw),
    yBottomRaw: data.yBottomRaw === undefined ? undefined : Number(data.yBottomRaw),
    avgDecimals: data.avgDecimals === undefined ? undefined : Number(data.avgDecimals),
    levels: readLevels(data.levels),
    referenceUrl: String(data.referenceUrl ?? ""),
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}
```

4. Update the imports at the top:

```typescript
import type {
  CustomMetricDef,
  CustomMetricInputType,
  CustomMetricLevel,
  CustomMetricPrimitive,
  CustomMetricType,
} from "../types/customMetrics";
```

5. Update `addMetric` / `updateMetric` signatures to accept the new fields. Find the existing function (search for `addMetric` in the file) and add `primitive` (required) and `levels` (optional) to its input type, plus include them in the Firestore write payload. Same for `updateMetric` (both fields optional in the patch type — `updateMetric` takes a partial today).

When writing levels back to Firestore, omit fields with `undefined` values so the doc shape stays clean. Example pattern:

```typescript
const levelsForWrite = levels?.map((l) => {
  const out: Record<string, unknown> = { label: l.label };
  if (l.value !== undefined) out.value = l.value;
  if (l.color !== undefined) out.color = l.color;
  return out;
});
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/contexts/CustomMetricsContext.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/CustomMetricsContext.tsx src/contexts/CustomMetricsContext.test.tsx
git commit -m "feat(metrics): plumb primitive + levels through CustomMetricsContext [DGT-50]"
```

---

## Task 3: Build the levels editor sub-component

**Files:**
- Create: `src/components/tracking/CustomMetricLevelsEditor.tsx`
- Create: `src/components/tracking/CustomMetricLevelsEditor.module.css`
- Create: `src/components/tracking/CustomMetricLevelsEditor.test.tsx`

This is a controlled component — the parent (CustomMetricForm) owns the levels state, the editor calls `onChange` with the next array. Keeps the form's submit/validation logic centralized.

- [ ] **Step 1: Write the failing test**

Create `src/components/tracking/CustomMetricLevelsEditor.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomMetricLevelsEditor } from "./CustomMetricLevelsEditor";
import type { CustomMetricLevel } from "../../types/customMetrics";

function renderEditor(initial: CustomMetricLevel[] = []) {
  const onChange = vi.fn<(next: CustomMetricLevel[]) => void>();
  const utils = render(
    <CustomMetricLevelsEditor levels={initial} onChange={onChange} />,
  );
  return { onChange, ...utils };
}

describe("CustomMetricLevelsEditor", () => {
  it("renders one row per level with label, value, color inputs", () => {
    renderEditor([
      { label: "Low", value: 1 },
      { label: "High", value: 3, color: "#f00" },
    ]);
    expect(screen.getAllByLabelText(/label/i)).toHaveLength(2);
    expect(screen.getAllByLabelText(/value/i)).toHaveLength(2);
    expect(screen.getAllByLabelText(/color/i)).toHaveLength(2);
  });

  it("calls onChange with the next array when 'add row' is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([{ label: "A", value: 1 }]);
    await user.click(screen.getByRole("button", { name: /add row/i }));
    expect(onChange).toHaveBeenCalledWith([
      { label: "A", value: 1 },
      { label: "", value: undefined },
    ]);
  });

  it("calls onChange with the next array when a label is edited", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([{ label: "A", value: 1 }]);
    const labelInput = screen.getByLabelText(/label/i);
    await user.clear(labelInput);
    await user.type(labelInput, "B");
    // Each keystroke fires onChange; the last call has the final value.
    expect(onChange).toHaveBeenLastCalledWith([{ label: "B", value: 1 }]);
  });

  it("calls onChange with value coerced to number when value input changes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([{ label: "A", value: 1 }]);
    const valueInput = screen.getByLabelText(/value/i);
    await user.clear(valueInput);
    await user.type(valueInput, "5");
    expect(onChange).toHaveBeenLastCalledWith([{ label: "A", value: 5 }]);
  });

  it("removes a row when the remove button is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([
      { label: "A", value: 1 },
      { label: "B", value: 2 },
    ]);
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith([{ label: "B", value: 2 }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/tracking/CustomMetricLevelsEditor.test.tsx
```

Expected: fail with "Cannot find module './CustomMetricLevelsEditor'".

- [ ] **Step 3: Implement the editor**

Create `src/components/tracking/CustomMetricLevelsEditor.tsx`:

```typescript
import type { CustomMetricLevel } from "../../types/customMetrics";
import css from "./CustomMetricLevelsEditor.module.css";

interface Props {
  levels: CustomMetricLevel[];
  onChange: (next: CustomMetricLevel[]) => void;
}

export function CustomMetricLevelsEditor({ levels, onChange }: Props) {
  function update(idx: number, patch: Partial<CustomMetricLevel>) {
    const next = levels.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    onChange(next);
  }

  function remove(idx: number) {
    onChange(levels.filter((_, i) => i !== idx));
  }

  function add() {
    onChange([...levels, { label: "", value: undefined }]);
  }

  return (
    <div className={css.editor}>
      <table className={css.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Label</th>
            <th>Value</th>
            <th>Color</th>
            <th aria-hidden="true"></th>
          </tr>
        </thead>
        <tbody>
          {levels.map((level, idx) => (
            <tr key={idx}>
              <td className={css.rowNum}>{idx + 1}</td>
              <td>
                <label className={css.visuallyHidden} htmlFor={`lvl-label-${idx}`}>
                  Label for row {idx + 1}
                </label>
                <input
                  id={`lvl-label-${idx}`}
                  type="text"
                  value={level.label}
                  onChange={(e) => update(idx, { label: e.target.value })}
                />
              </td>
              <td>
                <label className={css.visuallyHidden} htmlFor={`lvl-value-${idx}`}>
                  Value for row {idx + 1}
                </label>
                <input
                  id={`lvl-value-${idx}`}
                  type="number"
                  inputMode="decimal"
                  value={level.value === undefined ? "" : String(level.value)}
                  onChange={(e) => {
                    const v = e.target.value;
                    update(idx, {
                      value: v === "" ? undefined : Number(v),
                    });
                  }}
                />
              </td>
              <td>
                <label className={css.visuallyHidden} htmlFor={`lvl-color-${idx}`}>
                  Color for row {idx + 1}
                </label>
                <input
                  id={`lvl-color-${idx}`}
                  type="color"
                  value={level.color ?? "#000000"}
                  onChange={(e) => update(idx, { color: e.target.value })}
                />
              </td>
              <td>
                <button
                  type="button"
                  className={css.removeBtn}
                  onClick={() => remove(idx)}
                  aria-label={`Remove row ${idx + 1}`}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className={css.addBtn} onClick={add}>
        + Add row
      </button>
    </div>
  );
}
```

Create `src/components/tracking/CustomMetricLevelsEditor.module.css`:

```css
.editor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.table {
  border-collapse: collapse;
  width: 100%;
}

.table th,
.table td {
  padding: 0.25rem 0.5rem;
  text-align: left;
}

.table th {
  font-weight: 600;
  font-size: 0.875rem;
  color: #555;
}

.rowNum {
  color: #999;
  font-variant-numeric: tabular-nums;
  width: 2rem;
}

.table input[type="text"],
.table input[type="number"] {
  width: 100%;
  padding: 0.25rem 0.5rem;
  border: 1px solid #d6dde3;
  border-radius: 4px;
  font-family: inherit;
  font-size: 1rem;
  background: #ffffff;
}

.table input[type="color"] {
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid #d6dde3;
  border-radius: 4px;
  background: none;
  cursor: pointer;
}

.removeBtn {
  appearance: none;
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid #d6dde3;
  border-radius: 4px;
  background: #f5f5f5;
  color: #666;
  font-size: 1rem;
  font-family: inherit;
  cursor: pointer;
}

.removeBtn:hover {
  color: #e53e3e;
}

.addBtn {
  appearance: none;
  align-self: flex-start;
  padding: 0.375rem 0.75rem;
  border: 1px solid #d6dde3;
  border-radius: 4px;
  background: #f5f5f5;
  color: #0693e3;
  font-size: 0.875rem;
  font-family: inherit;
  cursor: pointer;
}

.visuallyHidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/components/tracking/CustomMetricLevelsEditor.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/tracking/CustomMetricLevelsEditor.tsx \
        src/components/tracking/CustomMetricLevelsEditor.module.css \
        src/components/tracking/CustomMetricLevelsEditor.test.tsx
git commit -m "feat(metrics): add CustomMetricLevelsEditor table sub-component [DGT-50]"
```

---

## Task 4: Add the three-button top-level type chooser to CustomMetricForm

This task adds the UI for the chooser and the new draft fields, but **does not yet** change submit behavior. That comes in Task 5.

**Files:**
- Modify: `src/components/tracking/CustomMetricForm.tsx`
- Modify: `src/components/tracking/CustomMetricForm.module.css`
- Modify: `src/components/tracking/CustomMetricForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `CustomMetricForm.test.tsx`. Reuse the existing render helpers (whatever the file uses to mount the form):

```typescript
describe("CustomMetricForm — top-level type chooser", () => {
  it("renders three top-level buttons: Numeric, Categorical, Y/N", () => {
    // Reuse the existing helper that renders the form on /add-metric/health.
    renderCreateForm("health");
    expect(screen.getByRole("radio", { name: /numeric/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /categorical/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /y\/n/i })).toBeTruthy();
  });

  it("shows the levels editor only when Categorical is selected", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    expect(screen.queryByRole("table")).toBeNull(); // Numeric: no table
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    expect(screen.getByRole("table")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /y\/n/i }));
    expect(screen.queryByRole("table")).toBeNull(); // Y/N: no table
  });

  it("greys out goal when Y/N is selected (per spec)", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.click(screen.getByRole("radio", { name: /y\/n/i }));
    const goal = screen.getByLabelText(/^goal$/i) as HTMLInputElement;
    expect(goal.disabled).toBe(true);
  });

  it("greys out y-axis range when Categorical is selected", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    expect((screen.getByLabelText(/y-axis top/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/y-axis bottom/i) as HTMLInputElement).disabled).toBe(true);
  });
});
```

If `renderCreateForm` doesn't exist in the test file, extract a helper out of the existing tests' setup that renders `<CustomMetricForm>` at `/add-metric/:type` via `MemoryRouter`. Look at lines around the first existing test to find the pattern.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/tracking/CustomMetricForm.test.tsx
```

Expected: fail — the radio buttons don't exist yet.

- [ ] **Step 3: Add the chooser to the form**

In `src/components/tracking/CustomMetricForm.tsx`:

1. Add the new draft state field. Find `DraftState` (around line 33) and extend:

```typescript
type TopLevelKind = "numeric" | "categorical" | "yn";

interface DraftState {
  topLevel: TopLevelKind;          // NEW
  name: string;
  inputType: CustomMetricInputType;
  unit: string;
  goalRaw: string;
  yTopRaw: string;
  yBottomRaw: string;
  avgDecimals: string;
  referenceUrl: string;
  levels: CustomMetricLevel[];     // NEW
}
```

2. Update `EMPTY_DRAFT`:

```typescript
const EMPTY_DRAFT: DraftState = {
  topLevel: "numeric",
  name: "",
  inputType: "numeric",
  unit: "",
  goalRaw: "0",
  yTopRaw: "10",
  yBottomRaw: "0",
  avgDecimals: "1",
  referenceUrl: "",
  levels: [],
};
```

3. Update the edit-mode hydration block (currently `if (!editing) return EMPTY_DRAFT`) to set `topLevel` from the editing metric's shape. Use this helper near the top of the file:

```typescript
const YN_LEVELS: CustomMetricLevel[] = [
  { label: "No", value: 0 },
  { label: "Yes", value: 1 },
];

function inferTopLevel(def: CustomMetricDef): TopLevelKind {
  if (def.primitive === "numeric") return "numeric";
  const lvls = def.levels;
  if (
    lvls &&
    lvls.length === 2 &&
    lvls[0].label === "No" &&
    lvls[0].value === 0 &&
    lvls[1].label === "Yes" &&
    lvls[1].value === 1
  ) {
    return "yn";
  }
  return "categorical";
}
```

Then in the edit-mode draft setup:

```typescript
const topLevel = inferTopLevel(editing);
return {
  topLevel,
  name: editing.name,
  inputType: editing.inputType,
  unit: editing.unit ?? "",
  goalRaw: String(editing.goalRaw ?? 0),
  yTopRaw: String(editing.yTopRaw ?? 0),
  yBottomRaw: String(editing.yBottomRaw ?? 0),
  avgDecimals: String(editing.avgDecimals ?? 1),
  referenceUrl: editing.referenceUrl ?? "",
  levels: editing.levels ?? [],
};
```

4. Remove the existing `INPUT_TYPE_OPTIONS` constant and the `<SelectField>` for Input type. They're replaced by the new chooser.

5. Add the chooser JSX above the Name field:

```typescript
<fieldset className={css.typeChooser}>
  <legend className={css.typeChooserLegend}>Type</legend>
  <label className={css.typeOption}>
    <input
      type="radio"
      name="cm-toplevel"
      value="numeric"
      checked={draft.topLevel === "numeric"}
      onChange={() => switchTopLevel("numeric")}
    />
    Numeric
  </label>
  <label className={css.typeOption}>
    <input
      type="radio"
      name="cm-toplevel"
      value="categorical"
      checked={draft.topLevel === "categorical"}
      onChange={() => switchTopLevel("categorical")}
    />
    Categorical
  </label>
  <label className={css.typeOption}>
    <input
      type="radio"
      name="cm-toplevel"
      value="yn"
      checked={draft.topLevel === "yn"}
      onChange={() => switchTopLevel("yn")}
    />
    Y/N
  </label>
</fieldset>
```

6. Add `switchTopLevel` inside `CustomMetricFormBody`:

```typescript
function switchTopLevel(next: TopLevelKind) {
  setDraft((prev) => {
    if (next === "numeric") {
      return { ...prev, topLevel: next, inputType: "numeric", levels: [] };
    }
    if (next === "yn") {
      return { ...prev, topLevel: next, inputType: "radio", levels: YN_LEVELS };
    }
    // categorical: keep existing levels (or start empty if coming from a state
    // that cleared them); clear yTop/yBottom because the submit will derive
    return { ...prev, topLevel: next, inputType: "radio", levels: prev.levels };
  });
}
```

7. Wire the `CustomMetricLevelsEditor` to render only when `draft.topLevel === "categorical"`:

```typescript
{draft.topLevel === "categorical" && (
  <div className={css.levelsBlock}>
    <label className={css.fieldLabel}>Levels</label>
    <CustomMetricLevelsEditor
      levels={draft.levels}
      onChange={(next) => update("levels", next)}
    />
  </div>
)}
```

Add the `CustomMetricLevelsEditor` import at the top of the file.

8. Compute disabled flags and apply them to each numeric-side field:

```typescript
const unitDisabled = draft.topLevel !== "numeric";
const goalDisabled = draft.topLevel === "yn";
const yAxisDisabled = draft.topLevel !== "numeric";
```

Pass `disabled={unitDisabled}` to the `unit` `<TextField>`, `disabled={goalDisabled}` to the `goalRaw` `<TextField>`, and `disabled={yAxisDisabled}` to both `yTopRaw` and `yBottomRaw`. If `<TextField>` doesn't accept `disabled`, check its source and add it (likely a one-line change to forward the prop to the native `<input>`).

Decimals remains enabled for all three.

9. Add CSS to `CustomMetricForm.module.css`:

```css
.typeChooser {
  display: flex;
  gap: 1rem;
  border: none;
  padding: 0;
  margin: 0 0 0.75rem 0;
}

.typeChooserLegend {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: #555;
}

.typeOption {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 1rem;
}

.levelsBlock {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.fieldLabel {
  font-size: 0.875rem;
  font-weight: 600;
  color: #555;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/components/tracking/CustomMetricForm.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/tracking/CustomMetricForm.tsx \
        src/components/tracking/CustomMetricForm.module.css \
        src/components/tracking/CustomMetricForm.test.tsx
git commit -m "feat(metrics): three-button type chooser + conditional levels editor [DGT-50]"
```

---

## Task 5: Submit-time validation, y-range derivation, and writing the right shape

**Files:**
- Modify: `src/components/tracking/CustomMetricForm.tsx`
- Modify: `src/components/tracking/CustomMetricForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `CustomMetricForm.test.tsx`:

```typescript
describe("CustomMetricForm — submit shape per top-level type", () => {
  it("writes primitive='numeric' with the full numeric config when Numeric is chosen", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.type(screen.getByLabelText(/^name$/i), "Steps");
    await user.click(screen.getByRole("button", { name: /save/i }));
    // setDoc is the mocked Firestore writer the form ultimately calls.
    expect(mockedSetDoc).toHaveBeenCalled();
    const payload = (mockedSetDoc as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload.primitive).toBe("numeric");
    expect(payload.levels).toBeUndefined();
    expect(payload.unit).toBe("");
    expect(payload.goalRaw).toBe(0);
  });

  it("writes primitive='ordinal' and the YN levels when Y/N is chosen", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.type(screen.getByLabelText(/^name$/i), "Slept Well?");
    await user.click(screen.getByRole("radio", { name: /y\/n/i }));
    await user.click(screen.getByRole("button", { name: /save/i }));
    const payload = (mockedSetDoc as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload.primitive).toBe("ordinal");
    expect(payload.inputType).toBe("radio");
    expect(payload.levels).toEqual([
      { label: "No", value: 0 },
      { label: "Yes", value: 1 },
    ]);
    expect(payload.yTopRaw).toBe(1);
    expect(payload.yBottomRaw).toBe(0);
    expect(payload.unit).toBeUndefined();
  });

  it("derives yTop/yBottom from levels' min/max when Categorical is chosen", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.type(screen.getByLabelText(/^name$/i), "Mood");
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    // Add a second row (the editor starts empty)
    await user.click(screen.getByRole("button", { name: /add row/i }));
    await user.click(screen.getByRole("button", { name: /add row/i }));
    await user.click(screen.getByRole("button", { name: /add row/i }));
    const labels = screen.getAllByLabelText(/^label/i);
    const values = screen.getAllByLabelText(/^value/i);
    await user.type(labels[0], "Low");
    await user.type(values[0], "1");
    await user.type(labels[1], "Mid");
    await user.type(values[1], "3");
    await user.type(labels[2], "High");
    await user.type(values[2], "5");
    await user.click(screen.getByRole("button", { name: /save/i }));
    const payload = (mockedSetDoc as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload.primitive).toBe("ordinal");
    expect(payload.levels).toEqual([
      { label: "Low", value: 1 },
      { label: "Mid", value: 3 },
      { label: "High", value: 5 },
    ]);
    expect(payload.yTopRaw).toBe(5);
    expect(payload.yBottomRaw).toBe(1);
  });

  it("rejects Categorical submit when any level is missing a value", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.type(screen.getByLabelText(/^name$/i), "Bad");
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    await user.click(screen.getByRole("button", { name: /add row/i }));
    const labels = screen.getAllByLabelText(/^label/i);
    await user.type(labels[0], "Solo");
    // value left empty
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/each level needs a numeric value/i)).toBeTruthy();
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });

  it("rejects Categorical submit when fewer than 2 levels are defined", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.type(screen.getByLabelText(/^name$/i), "Tiny");
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    // No "add row" clicks: levels stays empty
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/at least two levels/i)).toBeTruthy();
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });

  it("rejects Categorical submit when level values are not unique", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.type(screen.getByLabelText(/^name$/i), "Dup");
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    await user.click(screen.getByRole("button", { name: /add row/i }));
    await user.click(screen.getByRole("button", { name: /add row/i }));
    const labels = screen.getAllByLabelText(/^label/i);
    const values = screen.getAllByLabelText(/^value/i);
    await user.type(labels[0], "A");
    await user.type(values[0], "1");
    await user.type(labels[1], "B");
    await user.type(values[1], "1");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/level values must be unique/i)).toBeTruthy();
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/components/tracking/CustomMetricForm.test.tsx
```

Expected: the new tests fail (validation logic + payload-shaping not yet wired).

- [ ] **Step 3: Implement submit-time validation and shaping**

In `src/components/tracking/CustomMetricForm.tsx`, replace the existing `handleSubmit` body. Keep the existing numeric path intact and add the categorical branch:

```typescript
async function handleSubmit(e: FormEvent) {
  e.preventDefault();
  const trimmedName = draft.name.trim();
  if (!trimmedName) {
    setError("Name is required.");
    return;
  }
  if (trimmedName.length > NAME_MAX) {
    setError(`Name must be ${NAME_MAX} characters or fewer.`);
    return;
  }
  const trimmedRef = draft.referenceUrl.trim();
  if (trimmedRef) {
    // ... keep the existing URL validation block unchanged.
  }

  // Build the per-topLevel payload.
  let payload: Omit<CustomMetricDef, "id" | "ownerId" | "createdAt" | "updatedAt">;
  try {
    payload = buildPayload(draft, trimmedName, trimmedRef, type);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Invalid form.");
    return;
  }

  // ... keep the existing dataShapingChanged confirm guard and the
  // updateMetric / addMetric calls, but passing `payload` instead of the
  // hand-built object.
}
```

Add `buildPayload` near the top of the file:

```typescript
function buildPayload(
  draft: DraftState,
  trimmedName: string,
  trimmedRef: string,
  type: CustomMetricType,
): Omit<CustomMetricDef, "id" | "ownerId" | "createdAt" | "updatedAt"> {
  const avgDecimals = Number(draft.avgDecimals);
  if (
    !Number.isInteger(avgDecimals) ||
    avgDecimals < 0 ||
    avgDecimals > 100
  ) {
    throw new Error("Decimals must be an integer between 0 and 100.");
  }

  if (draft.topLevel === "numeric") {
    const goalRaw = Number(draft.goalRaw);
    const yTopRaw = Number(draft.yTopRaw);
    const yBottomRaw = Number(draft.yBottomRaw);
    if ([goalRaw, yTopRaw, yBottomRaw].some((v) => !Number.isFinite(v))) {
      throw new Error("Goal, y-axis top, and y-axis bottom must be finite.");
    }
    if (yBottomRaw >= yTopRaw) {
      throw new Error("Y-axis top must be greater than y-axis bottom.");
    }
    return {
      name: trimmedName,
      metricType: type,
      primitive: "numeric",
      inputType: "numeric",
      unit: draft.unit.trim(),
      goalRaw,
      yTopRaw,
      yBottomRaw,
      avgDecimals,
      referenceUrl: trimmedRef,
    };
  }

  // Categorical / Y/N share an ordinal shape.
  const levels = draft.topLevel === "yn" ? YN_LEVELS : draft.levels;
  if (levels.length < 2) {
    throw new Error("Categorical metrics need at least two levels.");
  }
  if (levels.some((l) => !l.label.trim())) {
    throw new Error("Each level needs a label.");
  }
  if (levels.some((l) => l.value === undefined || !Number.isFinite(l.value))) {
    throw new Error("Each level needs a numeric value.");
  }
  const values = levels.map((l) => l.value as number);
  if (new Set(values).size !== values.length) {
    throw new Error("Level values must be unique.");
  }
  const yTopRaw = Math.max(...values);
  const yBottomRaw = Math.min(...values);

  return {
    name: trimmedName,
    metricType: type,
    primitive: "ordinal",
    inputType: "radio",
    levels: levels.map((l) => {
      const out: CustomMetricLevel = { label: l.label.trim(), value: l.value };
      if (l.color) out.color = l.color;
      return out;
    }),
    avgDecimals,
    // For Y/N: goal is greyed and omitted. For Categorical: goal is editable
    // and meaningful.
    ...(draft.topLevel === "yn"
      ? {}
      : { goalRaw: Number(draft.goalRaw) || 0 }),
    yTopRaw,
    yBottomRaw,
    referenceUrl: trimmedRef,
  };
}
```

Update the `addMetric` and `updateMetric` calls to pass `payload` directly. Make sure the writer in `CustomMetricsContext` (from Task 2) accepts the new shape with `unit?: string` etc.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/tracking/CustomMetricForm.test.tsx
```

Expected: pass.

- [ ] **Step 5: Run the full test suite to catch regressions**

```bash
npm test
```

Expected: pass. If any failures elsewhere, they're likely call sites that build a custom-metric payload without `primitive`. Fix them by setting `primitive: "numeric"` (since they're all numeric customs today).

- [ ] **Step 6: Commit**

```bash
git add src/components/tracking/CustomMetricForm.tsx \
        src/components/tracking/CustomMetricForm.test.tsx
git commit -m "feat(metrics): submit-time validation + y-range derivation per top-level kind [DGT-50]"
```

---

## Task 6: Edit-mode inference

This task makes opening an existing ordinal metric land on the correct top-level button.

**Files:**
- Modify: `src/components/tracking/CustomMetricForm.test.tsx`

The `inferTopLevel` helper was already added in Task 4. This task only adds the test.

- [ ] **Step 1: Write the failing test**

Append to `CustomMetricForm.test.tsx`:

```typescript
describe("CustomMetricForm — edit-mode inference", () => {
  it("opens with Numeric selected for an existing numeric metric", () => {
    renderEditForm("health", {
      id: "c_x",
      ownerId: "u1",
      name: "Steps",
      metricType: "health",
      primitive: "numeric",
      unit: "steps",
      goalRaw: 10000,
      yTopRaw: 20000,
      yBottomRaw: 0,
      avgDecimals: 0,
      inputType: "numeric",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    });
    expect((screen.getByRole("radio", { name: /numeric/i }) as HTMLInputElement).checked).toBe(true);
  });

  it("opens with Y/N selected for an ordinal metric with the canonical No/Yes levels", () => {
    renderEditForm("health", {
      id: "c_x",
      ownerId: "u1",
      name: "Slept Well?",
      metricType: "health",
      primitive: "ordinal",
      levels: [
        { label: "No", value: 0 },
        { label: "Yes", value: 1 },
      ],
      yTopRaw: 1,
      yBottomRaw: 0,
      avgDecimals: 1,
      inputType: "radio",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    });
    expect((screen.getByRole("radio", { name: /y\/n/i }) as HTMLInputElement).checked).toBe(true);
  });

  it("opens with Categorical selected for an ordinal metric with other levels", () => {
    renderEditForm("health", {
      id: "c_x",
      ownerId: "u1",
      name: "Mood",
      metricType: "health",
      primitive: "ordinal",
      levels: [
        { label: "Low", value: 1 },
        { label: "Mid", value: 3 },
        { label: "High", value: 5 },
      ],
      yTopRaw: 5,
      yBottomRaw: 1,
      avgDecimals: 1,
      inputType: "radio",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    });
    expect((screen.getByRole("radio", { name: /categorical/i }) as HTMLInputElement).checked).toBe(true);
  });
});
```

If `renderEditForm` doesn't exist in the test file, extract a helper that mounts `<CustomMetricForm>` at `/add-metric/:type/:metricId` and seeds the `CustomMetricsContext` mock so `getMetric` returns the passed-in definition.

- [ ] **Step 2: Run the tests to verify they pass**

```bash
npx vitest run src/components/tracking/CustomMetricForm.test.tsx
```

Expected: pass — the `inferTopLevel` helper from Task 4 already handles all three cases. If a test fails, the helper logic is wrong; trace it back.

- [ ] **Step 3: Commit**

```bash
git add src/components/tracking/CustomMetricForm.test.tsx
git commit -m "test(metrics): cover edit-mode top-level inference [DGT-50]"
```

---

## Task 7: Add the `ordinal` branch to `MetricInputRow`

**Files:**
- Modify: `src/components/logs/MetricInputRow.tsx`
- Modify: `src/components/logs/MetricInputRow.module.css`
- Modify: `src/components/logs/MetricInputRow.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `MetricInputRow.test.tsx`:

```typescript
import type { CustomMetricLevel } from "../../types/customMetrics";

const MOOD_LEVELS: CustomMetricLevel[] = [
  { label: "Low", value: 1 },
  { label: "Mid", value: 3 },
  { label: "High", value: 5 },
];

const MOOD_METRIC: MetricDefinition = {
  id: "c_mood",
  name: "Mood",
  unit: "",
  type: "health",
  whoCollects: "",
  howCollected: "",
  description: "",
  inputType: "radio",
};

function renderOrdinal(initial: number | undefined = undefined) {
  const onChange = vi.fn<(next: number) => void>();
  const utils = render(
    <MemoryRouter>
      <table>
        <tbody>
          <MetricInputRow
            inputType="ordinal"
            metric={MOOD_METRIC}
            levels={MOOD_LEVELS}
            value={initial}
            onChange={onChange}
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
  return { onChange, ...utils };
}

describe("MetricInputRow Ordinal", () => {
  it("renders one radio per level with the label as visible text", () => {
    renderOrdinal();
    expect(screen.getByRole("radio", { name: /^low$/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^mid$/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^high$/i })).toBeTruthy();
  });

  it("marks the selected level via aria-checked", () => {
    renderOrdinal(3);
    expect(
      (screen.getByRole("radio", { name: /^mid$/i }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("fires onChange with the numeric value when a level is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderOrdinal();
    await user.click(screen.getByRole("radio", { name: /^high$/i }));
    expect(onChange).toHaveBeenCalledWith(5);
  });
});
```

Add the `userEvent` import at the top of the file if not already present.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/components/logs/MetricInputRow.test.tsx
```

Expected: fail — the `ordinal` inputType isn't part of `MetricInputRowProps`.

- [ ] **Step 3: Add the ordinal branch**

In `src/components/logs/MetricInputRow.tsx`:

1. Add the new prop type after `TreeMetricInputRowProps`:

```typescript
export interface OrdinalMetricInputRowProps extends BaseProps {
  inputType: "ordinal";
  levels: CustomMetricLevel[];
  value: number | undefined;
  onChange: (next: number) => void;
}
```

Update the union:

```typescript
export type MetricInputRowProps =
  | NumericMetricInputRowProps
  | ColorScaleMetricInputRowProps
  | TreeMetricInputRowProps
  | OrdinalMetricInputRowProps;
```

Add the import:

```typescript
import type { CustomMetricLevel } from "../../types/customMetrics";
```

2. Add the render branch inside `MetricInputRow`'s `<td>`:

```typescript
{props.inputType === "ordinal" && (
  <OrdinalRadioGroup
    levels={props.levels}
    value={props.value}
    onChange={props.onChange}
    labelledBy={nameId}
  />
)}
```

3. Add the `OrdinalRadioGroup` component below `ColorScale`:

```typescript
interface OrdinalRadioGroupProps {
  levels: CustomMetricLevel[];
  value: number | undefined;
  onChange: (next: number) => void;
  labelledBy: string;
}

function OrdinalRadioGroup({
  levels,
  value,
  onChange,
  labelledBy,
}: OrdinalRadioGroupProps) {
  const groupName = useId();
  return (
    <div
      className={css.ordinalGroup}
      role="radiogroup"
      aria-labelledby={labelledBy}
    >
      {levels.map((level) => {
        // levels with a numeric value are the only ones reachable here
        // (the form rejects any submit that leaves value undefined for
        // ordinal). Treat absence defensively: skip rendering.
        if (level.value === undefined) return null;
        const checked = value === level.value;
        return (
          <label key={level.value} className={css.ordinalOption}>
            <input
              type="radio"
              name={groupName}
              checked={checked}
              onChange={() => onChange(level.value as number)}
            />
            {level.label}
          </label>
        );
      })}
    </div>
  );
}
```

4. Add CSS:

```css
.ordinalGroup {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.ordinalOption {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 1rem;
  cursor: pointer;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/components/logs/MetricInputRow.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/logs/MetricInputRow.tsx \
        src/components/logs/MetricInputRow.module.css \
        src/components/logs/MetricInputRow.test.tsx
git commit -m "feat(logs): render ordinal customs as horizontal radio group [DGT-50]"
```

---

## Task 8: Plumb `primitive`/`levels` through HealthLog and CompetitionLog

**Files:**
- Modify: `src/components/logs/HealthLog.tsx`
- Modify: `src/components/logs/CompetitionLog.tsx`
- Modify: `src/components/logs/HealthLog.test.tsx`
- Modify: `src/components/logs/CompetitionLog.test.tsx`

- [ ] **Step 1: Read the current custom-metric rendering in both logs**

```bash
grep -n "customMetrics" src/components/logs/HealthLog.tsx src/components/logs/CompetitionLog.tsx
grep -n "inputType" src/components/logs/HealthLog.tsx src/components/logs/CompetitionLog.tsx
```

Find the spot where each log renders a `<MetricInputRow inputType="numeric" .../>` for a custom metric (HealthLog likely around line 220-260 per the earlier grep). The pattern is the same in both logs.

- [ ] **Step 2: Write the failing tests**

In each `*Log.test.tsx`, add a test that an ordinal custom metric renders as a radio group rather than a number input. Existing tests in those files use a custom-metrics mock similar to:

```typescript
const customMetricsMock = vi.hoisted(() => ({
  metrics: [
    {
      id: "c_mood",
      ownerId: "u1",
      name: "Mood",
      metricType: "health",
      primitive: "ordinal",
      levels: [
        { label: "Low", value: 1 },
        { label: "High", value: 3 },
      ],
      yTopRaw: 3,
      yBottomRaw: 1,
      avgDecimals: 1,
      inputType: "radio",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  // ... other fields the existing mock provides
}));
```

Then assert:

```typescript
it("renders an ordinal custom metric as a radio group", () => {
  // ... mount HealthLog with the mock above + a tracked metric ID c_mood
  expect(screen.getByRole("radio", { name: /^low$/i })).toBeTruthy();
  expect(screen.getByRole("radio", { name: /^high$/i })).toBeTruthy();
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx vitest run src/components/logs/HealthLog.test.tsx src/components/logs/CompetitionLog.test.tsx
```

Expected: fail.

- [ ] **Step 4: Branch the render in each log**

In `HealthLog.tsx`, find the custom-metric render call (looks like `<MetricInputRow inputType="numeric" metric={...} value={...} onChange={...} />`). Replace with:

```typescript
{def.primitive === "ordinal" && def.levels ? (
  <MetricInputRow
    inputType="ordinal"
    metric={asMetricDefinition(def)}
    levels={def.levels}
    value={entry.customMetrics?.[def.id] as number | undefined}
    onChange={(next) =>
      setHealthEntry(entry.date, {
        ...entry,
        customMetrics: {
          ...entry.customMetrics,
          [def.id]: next,
        },
      })
    }
  />
) : (
  <MetricInputRow
    inputType="numeric"
    metric={asMetricDefinition(def)}
    value={...} // existing
    onChange={...} // existing
    allowNegative={(def.yBottomRaw ?? 0) < 0}
  />
)}
```

Note: `asMetricDefinition(def)` is whatever helper the file uses today to adapt `CustomMetricDef` to `MetricDefinition` for `MetricInputRow`. Reuse it; if it's inlined, factor out an inline `const adapted = { id: def.id, name: def.name, ... }` rather than introducing a new helper just for this PR.

Repeat in `CompetitionLog.tsx` (storing into `entry.metrics` instead of `entry.customMetrics`).

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/components/logs/HealthLog.test.tsx src/components/logs/CompetitionLog.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/logs/HealthLog.tsx \
        src/components/logs/HealthLog.test.tsx \
        src/components/logs/CompetitionLog.tsx \
        src/components/logs/CompetitionLog.test.tsx
git commit -m "feat(logs): branch HealthLog + CompetitionLog rendering on primitive [DGT-50]"
```

---

## Task 9: Drop now-stale comments and run final checks

**Files:**
- Modify: `src/components/tracking/CustomMetricForm.tsx` (remove the type-reserved-but-hidden comment near the old `INPUT_TYPE_OPTIONS`)

- [ ] **Step 1: Remove the stale comment**

The comment around the old `INPUT_TYPE_OPTIONS` constant (Task 4 already removed the constant itself) explained why `radio` was hidden. Since Task 4 dropped the constant, also drop any orphan comment left behind. Search for "type-reserved" or "reserved in the type system" in the form file and remove the block.

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: pass.

- [ ] **Step 3: Run the type check**

```bash
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 4: Run the production build**

```bash
npm run build
```

Expected: build succeeds. Catches anything Vite's prod path complains about that the dev path tolerates.

- [ ] **Step 5: Manual smoke test against the emulator**

In one terminal:

```bash
npm run emulators
```

In another:

```bash
npm run dev
```

In the browser at `http://localhost:5173`:

1. Sign in.
2. Go to **Setup → Tracked Data Setup → Add custom metric** for Health.
3. Pick **Numeric**, name it "Steps", save. Confirm it appears in the tracked list with a numeric input on the log.
4. Add another custom: pick **Y/N**, name it "Slept Well?". Confirm:
   - Goal field is greyed out.
   - Y-axis top/bottom are greyed out.
   - No levels table is shown.
   - Save succeeds.
5. On the **Log** page, find the new "Slept Well?" row. Confirm it shows two radio buttons labeled "No" and "Yes". Click one; navigate away and back. Confirm the selection persists.
6. Add another custom: pick **Categorical**, name it "Mood".
   - Confirm a levels table appears with "+ Add row" button.
   - Add three rows: Low=1, Mid=3, High=5.
   - Confirm goal field is editable, y-axis fields are greyed out.
   - Save succeeds.
7. On the **Log** page, find the "Mood" row. Confirm it shows three radio buttons. Click "Mid"; navigate and confirm persistence.
8. Edit each of the three saved metrics. Confirm the correct top-level button (Numeric / Categorical / Y/N) is highlighted on open.
9. Open the chart for "Mood" (DashboardChartCard or MetricDetail). Confirm the chart renders with y-axis [1, 5].

Any failures here → file a bug, decide whether to fix in this PR or defer.

- [ ] **Step 6: Commit any cleanup**

```bash
git add src/components/tracking/CustomMetricForm.tsx
git commit -m "chore(metrics): drop stale type-reserved-but-hidden comment [DGT-50]" \
  --allow-empty   # only if no actual changes; usually skip
```

(Skip the commit if there were no leftover comments to remove.)

- [ ] **Step 7: Push the branch and open the PR**

```bash
git push -u origin DGT-50-non-numeric-customs
gh pr create --title "DGT-50: Non-numeric custom metric types (Y/N + Categorical)" \
  --body "$(cat <<'EOF'
## Summary
- Adds `primitive` discriminator + `levels` array to `CustomMetricDef`.
- New three-button type chooser in the custom-metric form (Numeric / Categorical / Y/N).
- Log renders ordinal custom metrics as a horizontal radio group.
- Y-axis range derived from levels at save-time; chart engine untouched.

## Out of scope (deferred)
- Nominal-primitive UI (creation, input, chart).
- Color-swatch log input for customs.
- Label-tick chart axis.
- Median aggregation for ordinals.

## Test plan
- [ ] Vitest passes locally
- [ ] tsc --noEmit passes
- [ ] Manual smoke per the plan's Task 9 step 5 against the emulator
- [ ] Reviewed by Doug Martin (Developer Approver default)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Strip the plan + spec from the working tree before merge**

The repo convention (see commit `6511eb7 chore(docs): drop DGT-53 implementation plan from working tree`) is to remove the plan/design notes from the working tree before merge, since they're working artifacts not long-lived docs. Run after the PR is approved and you're about to merge:

```bash
git rm notes/2026-05-11-dgt-50-schema-design.md \
       notes/2026-05-11-dgt-50-implementation-plan.md
git commit -m "chore(docs): drop DGT-50 design+plan from working tree [DGT-50]"
git push
```

---

## Self-review notes (for the plan author, not the engineer)

**Spec coverage check:**
- ✅ `primitive` discriminator → Task 1
- ✅ `levels` field → Task 1
- ✅ Numeric-only fields become optional → Task 1
- ✅ Three-button top-level chooser → Task 4
- ✅ Levels table editor → Task 3
- ✅ Conditional field greying → Task 4
- ✅ Submit-time y-range derivation → Task 5
- ✅ Edit-mode top-level inference → Tasks 4 + 6
- ✅ Y/N hardcoded levels → Task 4 (switchTopLevel) + Task 5 (buildPayload)
- ✅ Ordinal radio rendering in log → Task 7
- ✅ HealthLog/CompetitionLog plumbing → Task 8
- ✅ No migration / read-time defaulting → Task 2 (readPrimitive throws on missing)
- ✅ Manual smoke per spec demo lines → Task 9 step 5
- ✅ Out-of-scope items remain unimplemented (no tasks address nominal, color-swatch, label-tick, median)

**Type consistency:** `CustomMetricPrimitive`, `CustomMetricLevel`, `inferTopLevel`, `YN_LEVELS`, `buildPayload`, `switchTopLevel`, `OrdinalRadioGroup` all referenced consistently across tasks.

**Placeholder scan:** No TBDs, no "implement appropriately," no orphan references.
