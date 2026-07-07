# DGT-19 Time Inputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let athletes enter and see time-valued metrics (sleep, run/race durations, sprints) as `h:mm` / `m:ss` / `h:mm:ss` / seconds, for both built-in and custom metrics, without changing the stored data model.

**Architecture:** A metric becomes a "time" metric by declaring `timePrecision` (its finest field); the coarsest field is derived from its existing `unit`. A stored value stays a single decimal number in the coarsest unit — the multi-field UI is pure entry/display sugar. One pure util (`src/utils/timeValue.ts`) parses fields→decimal and formats decimal→fields/string; a `TimeInput` component uses it; `MetricInputRow` routes numeric metrics with a `timePrecision` to `TimeInput`; charts format via a `timeLayout` baked into `formatValue`.

**Tech Stack:** React 19 + TypeScript + Vite; Vitest (colocated `*.test.ts[x]`, jsdom pragma for component tests, React Testing Library); CSS Modules.

## Global Constraints

- Stored value is unchanged: a single decimal `number` in the metric's **coarsest** time unit (sleep = decimal hours, mile = decimal minutes, sprint = decimal seconds). **No data migration.**
- `timePrecision` is the discriminator. Coarsest is derived from `displayUnit` (preferred) or `unit` via `normalizeTimeUnit`. `precision ≤ coarsest`.
- Layouts supported: `h:mm`, `m:ss`, `h:mm:ss`, `s`. All four are first-class (`h:mm:ss` for marathon/half-marathon: unit `hr` + precision `s`).
- Per-field decimal rules: a **seconds** field always accepts a decimal (sub-second race timing); the **coarsest** field accepts a decimal shorthand when finer fields are empty; every other field is integer-only.
- On blur, fields normalize via `parseTimeToDecimal → formatDecimalToFields` (splits `8.5h`→`8:30`). A decimal in a non-finest field while a finer field holds a value is ambiguous → rejected with an inline error.
- `avgDecimals` is repurposed as `secondsDecimals` for time metrics: decimal places on the seconds component. Ignored for `h:mm` (no seconds component).
- No em dashes in UI copy — regular hyphens. Conditional classNames via `clsx()`. Vanilla CSS Modules only; no nesting (`&`).
- Verify with `npm run build` (runs `tsc -b`) — not `tsc --noEmit`. Tests: `npm test`.
- CODAP export is **out of scope** (deferred to DGT-77). Values continue to reach CODAP as plain numbers.

Spec: `docs/superpowers/specs/2026-07-01-dgt-19-time-inputs-design.md`.

---

### Task 1: `timeValue` utility

**Files:**
- Create: `src/utils/timeValue.ts`
- Test: `src/utils/timeValue.test.ts`

**Interfaces:**
- Produces:
  - `type TimeUnit = "h" | "m" | "s"`
  - `interface TimeLayout { coarsest: TimeUnit; precision: TimeUnit }`
  - `interface TimeFields { h?: string; m?: string; s?: string }`
  - `normalizeTimeUnit(unit: string | undefined): TimeUnit | null`
  - `resolveTimeLayout(meta: { unit?: string; displayUnit?: string; timePrecision?: TimeUnit }): TimeLayout | null`
  - `layoutUnits(layout: TimeLayout): TimeUnit[]` (coarsest→precision, inclusive)
  - `parseTimeToDecimal(fields: TimeFields, layout: TimeLayout): number | null` (null = empty **or** invalid)
  - `isAllEmpty(fields: TimeFields, layout: TimeLayout): boolean`
  - `formatDecimalToFields(value: number, layout: TimeLayout, secondsDecimals?: number): TimeFields`
  - `formatDecimalToTime(value: number, layout: TimeLayout, secondsDecimals?: number): string`

- [ ] **Step 1: Write the failing test**

`src/utils/timeValue.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  normalizeTimeUnit,
  resolveTimeLayout,
  parseTimeToDecimal,
  formatDecimalToFields,
  formatDecimalToTime,
  isAllEmpty,
  type TimeLayout,
} from "./timeValue";

const HMM: TimeLayout = { coarsest: "h", precision: "m" };       // sleep
const MSS: TimeLayout = { coarsest: "m", precision: "s" };       // mile
const HMS: TimeLayout = { coarsest: "h", precision: "s" };       // marathon
const SEC: TimeLayout = { coarsest: "s", precision: "s" };       // sprint

describe("normalizeTimeUnit", () => {
  it("maps hour/minute/second spellings", () => {
    expect(normalizeTimeUnit("hr")).toBe("h");
    expect(normalizeTimeUnit("hr/night")).toBe("h");
    expect(normalizeTimeUnit("hour")).toBe("h");
    expect(normalizeTimeUnit("min")).toBe("m");
    expect(normalizeTimeUnit("sec")).toBe("s");
    expect(normalizeTimeUnit("s")).toBe("s");
  });
  it("returns null for non-time units", () => {
    expect(normalizeTimeUnit("kg")).toBeNull();
    expect(normalizeTimeUnit(undefined)).toBeNull();
    expect(normalizeTimeUnit("")).toBeNull();
  });
});

describe("resolveTimeLayout", () => {
  it("derives coarsest from displayUnit, precision from timePrecision", () => {
    expect(
      resolveTimeLayout({ unit: "hr/night", displayUnit: "hr", timePrecision: "m" }),
    ).toEqual(HMM);
    expect(resolveTimeLayout({ unit: "min", timePrecision: "s" })).toEqual(MSS);
    expect(resolveTimeLayout({ unit: "sec", timePrecision: "s" })).toEqual(SEC);
  });
  it("is null without timePrecision or with an unmappable/inverted unit", () => {
    expect(resolveTimeLayout({ unit: "hr" })).toBeNull();
    expect(resolveTimeLayout({ unit: "kg", timePrecision: "s" })).toBeNull();
    // precision coarser than unit (min unit, hour precision) is invalid
    expect(resolveTimeLayout({ unit: "min", timePrecision: "h" })).toBeNull();
  });
});

describe("parseTimeToDecimal", () => {
  it("combines fields into the coarsest-unit decimal", () => {
    expect(parseTimeToDecimal({ h: "8", m: "30" }, HMM)).toBeCloseTo(8.5, 6);
    expect(parseTimeToDecimal({ m: "5", s: "30" }, MSS)).toBeCloseTo(5.5, 6);
    expect(parseTimeToDecimal({ h: "1", m: "23", s: "45" }, HMS)).toBeCloseTo(
      1 + 23 / 60 + 45 / 3600,
      6,
    );
    expect(parseTimeToDecimal({ s: "36.54" }, SEC)).toBeCloseTo(36.54, 6);
  });
  it("accepts a decimal shorthand in the coarsest field when finer fields are empty", () => {
    expect(parseTimeToDecimal({ h: "8.6", m: "" }, HMM)).toBeCloseTo(8.6, 6);
    expect(parseTimeToDecimal({ m: "5.5", s: "" }, MSS)).toBeCloseTo(5.5, 6);
  });
  it("accepts a decimal in the seconds (finest) field", () => {
    expect(parseTimeToDecimal({ m: "5", s: "30.5" }, MSS)).toBeCloseTo(
      5 + 30.5 / 60,
      6,
    );
  });
  it("rejects a decimal in a non-finest field when a finer field is set (ambiguous)", () => {
    expect(parseTimeToDecimal({ h: "8.5", m: "40" }, HMM)).toBeNull();
    expect(parseTimeToDecimal({ m: "5.5", s: "20" }, MSS)).toBeNull();
  });
  it("rejects a decimal in an integer-only mid field", () => {
    // minutes is neither coarsest nor seconds in h:mm:ss -> integer only
    expect(parseTimeToDecimal({ h: "1", m: "23.5", s: "0" }, HMS)).toBeNull();
  });
  it("enforces 0-59 minutes and [0,60) seconds on non-coarsest fields", () => {
    expect(parseTimeToDecimal({ h: "8", m: "60" }, HMM)).toBeNull();
    expect(parseTimeToDecimal({ m: "5", s: "60" }, MSS)).toBeNull();
    expect(parseTimeToDecimal({ m: "5", s: "59.9" }, MSS)).toBeCloseTo(
      5 + 59.9 / 60,
      6,
    );
  });
  it("allows the coarsest field to exceed 59 (unbounded)", () => {
    expect(parseTimeToDecimal({ m: "150", s: "0" }, MSS)).toBeCloseTo(150, 6);
  });
  it("returns null for all-empty and for garbage", () => {
    expect(parseTimeToDecimal({ h: "", m: "" }, HMM)).toBeNull();
    expect(parseTimeToDecimal({ h: "x", m: "" }, HMM)).toBeNull();
  });
});

describe("isAllEmpty", () => {
  it("is true only when every layout field is blank", () => {
    expect(isAllEmpty({ h: "", m: "" }, HMM)).toBe(true);
    expect(isAllEmpty({ h: "8", m: "" }, HMM)).toBe(false);
  });
});

describe("formatDecimalToFields (blur normalization)", () => {
  it("splits a coarsest decimal into fields", () => {
    expect(formatDecimalToFields(8.5, HMM)).toEqual({ h: "8", m: "30" });
    expect(formatDecimalToFields(8.6, HMM)).toEqual({ h: "8", m: "36" });
    expect(formatDecimalToFields(5.5, MSS, 0)).toEqual({ m: "5", s: "30" });
  });
  it("rounds at the minutes floor for h:mm and carries", () => {
    expect(formatDecimalToFields(8.61, HMM)).toEqual({ h: "8", m: "37" });
    expect(formatDecimalToFields(8.999, HMM)).toEqual({ h: "9", m: "0" });
  });
  it("keeps fractional seconds for a seconds-precision layout", () => {
    expect(formatDecimalToFields(8.615, HMS, 0)).toEqual({ h: "8", m: "36", s: "54" });
    expect(formatDecimalToFields(5 + 30.5 / 60, MSS, 1)).toEqual({ m: "5", s: "30.5" });
  });
});

describe("formatDecimalToTime", () => {
  it("renders each layout, padding finer fields", () => {
    expect(formatDecimalToTime(8.5, HMM)).toBe("8:30");
    expect(formatDecimalToTime(8 + 5 / 60, HMM)).toBe("8:05");
    expect(formatDecimalToTime(5.5, MSS, 0)).toBe("5:30");
    expect(formatDecimalToTime(1 + 23 / 60 + 45 / 3600, HMS, 0)).toBe("1:23:45");
  });
  it("applies secondsDecimals to the seconds component", () => {
    expect(formatDecimalToTime(5 + 3.45 / 60, MSS, 0)).toBe("5:03");
    expect(formatDecimalToTime(5 + 3.45 / 60, MSS, 1)).toBe("5:03.5");
    expect(formatDecimalToTime(5 + 3.45 / 60, MSS, 2)).toBe("5:03.45");
  });
  it("renders a seconds-only layout without a colon", () => {
    expect(formatDecimalToTime(5.3, SEC, 1)).toBe("5.3");
    expect(formatDecimalToTime(5, SEC, 0)).toBe("5");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/utils/timeValue.test.ts`
Expected: FAIL — `Cannot find module './timeValue'`.

- [ ] **Step 3: Write the implementation**

`src/utils/timeValue.ts`:
```ts
export type TimeUnit = "h" | "m" | "s";
export interface TimeLayout {
  coarsest: TimeUnit;
  precision: TimeUnit;
}
export interface TimeFields {
  h?: string;
  m?: string;
  s?: string;
}

// Ordering: coarser units have a smaller rank. h(0) > m(1) > s(2).
const RANK: Record<TimeUnit, number> = { h: 0, m: 1, s: 2 };
const SEC_PER: Record<TimeUnit, number> = { h: 3600, m: 60, s: 1 };

// Map a free-form unit string to a canonical time unit. Tolerates a rate
// suffix ("hr/night") by reading the leading token. Returns null for a
// non-time unit ("kg", "%", "", undefined).
export function normalizeTimeUnit(unit: string | undefined): TimeUnit | null {
  if (!unit) return null;
  const token = unit.trim().toLowerCase().split(/[^a-z]/)[0];
  if (["h", "hr", "hour", "hours"].includes(token)) return "h";
  if (["m", "min", "minute", "minutes"].includes(token)) return "m";
  if (["s", "sec", "second", "seconds"].includes(token)) return "s";
  return null;
}

// Resolve a metric-like object to a layout. Prefers displayUnit ("hr")
// over unit ("hr/night"). Null when the metric is not a time metric
// (no timePrecision), its unit is unmappable, or precision is coarser
// than the unit.
export function resolveTimeLayout(meta: {
  unit?: string;
  displayUnit?: string;
  timePrecision?: TimeUnit;
}): TimeLayout | null {
  if (!meta.timePrecision) return null;
  const coarsest = normalizeTimeUnit(meta.displayUnit ?? meta.unit);
  if (!coarsest) return null;
  if (RANK[meta.timePrecision] < RANK[coarsest]) return null; // precision coarser than unit
  return { coarsest, precision: meta.timePrecision };
}

// The units a layout renders, coarsest -> precision inclusive.
export function layoutUnits(layout: TimeLayout): TimeUnit[] {
  return (["h", "m", "s"] as TimeUnit[]).filter(
    (u) => RANK[u] >= RANK[layout.coarsest] && RANK[u] <= RANK[layout.precision],
  );
}

function fieldOf(fields: TimeFields, unit: TimeUnit): string {
  return (fields[unit] ?? "").trim();
}

export function isAllEmpty(fields: TimeFields, layout: TimeLayout): boolean {
  return layoutUnits(layout).every((u) => fieldOf(fields, u) === "");
}

// Parse the sub-fields into a decimal in the coarsest unit. Returns null
// for an all-empty entry OR any invalid/ambiguous combination (the
// caller distinguishes empty via isAllEmpty).
export function parseTimeToDecimal(
  fields: TimeFields,
  layout: TimeLayout,
): number | null {
  const units = layoutUnits(layout);
  if (isAllEmpty(fields, layout)) return null;

  let totalSeconds = 0;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const raw = fieldOf(fields, unit);
    const isCoarsest = i === 0;
    const isFinest = i === units.length - 1;
    const isSeconds = unit === "s";
    const allowDecimal = isCoarsest || isSeconds;

    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) return null;

    const hasFraction = !Number.isInteger(value);
    if (hasFraction && !allowDecimal) return null; // integer-only mid field
    // Ambiguous: a decimal in a non-finest field while a finer field is set.
    if (hasFraction && !isFinest) {
      const anyFinerSet = units.slice(i + 1).some((u) => fieldOf(fields, u) !== "");
      if (anyFinerSet) return null;
    }
    // Range: non-coarsest minutes are 0-59 integers; non-coarsest seconds are [0,60).
    if (!isCoarsest) {
      if (unit === "m" && (!Number.isInteger(value) || value > 59)) return null;
      if (unit === "s" && value >= 60) return null;
    }
    totalSeconds += value * SEC_PER[unit];
  }
  return totalSeconds / SEC_PER[layout.coarsest];
}

// Round a total-seconds amount to the layout's finest granularity, so the
// subsequent floor-decompose never needs a 59->60 carry.
function roundedTotalSeconds(
  value: number,
  layout: TimeLayout,
  secondsDecimals: number,
): number {
  const totalSeconds = value * SEC_PER[layout.coarsest];
  if (layout.precision === "s") {
    const f = Math.pow(10, secondsDecimals);
    return Math.round(totalSeconds * f) / f;
  }
  const step = SEC_PER[layout.precision]; // 3600 (h) or 60 (m)
  return Math.round(totalSeconds / step) * step;
}

function decompose(
  value: number,
  layout: TimeLayout,
  secondsDecimals: number,
): Record<TimeUnit, number> {
  const units = layoutUnits(layout);
  let rem = roundedTotalSeconds(value, layout, secondsDecimals);
  const out = {} as Record<TimeUnit, number>;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const secPer = SEC_PER[unit];
    if (i < units.length - 1) {
      const q = Math.floor(rem / secPer);
      out[unit] = q;
      rem -= q * secPer;
    } else {
      // finest: exact remainder (already rounded to this granularity)
      out[unit] =
        unit === "s"
          ? Number((rem / secPer).toFixed(secondsDecimals))
          : Math.round(rem / secPer);
    }
  }
  return out;
}

// Split a stored decimal into display fields (blur normalization seed).
export function formatDecimalToFields(
  value: number,
  layout: TimeLayout,
  secondsDecimals: number = 2,
): TimeFields {
  const parts = decompose(value, layout, secondsDecimals);
  const fields: TimeFields = {};
  for (const unit of layoutUnits(layout)) fields[unit] = String(parts[unit]);
  return fields;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Render a stored decimal as a time string. Finer fields are zero-padded;
// the coarsest is not. A seconds-only layout renders without a colon.
export function formatDecimalToTime(
  value: number,
  layout: TimeLayout,
  secondsDecimals: number = 2,
): string {
  const units = layoutUnits(layout);
  const parts = decompose(value, layout, secondsDecimals);
  if (units.length === 1) {
    // seconds-only (or a degenerate single field): no padding, no colon
    return String(parts[units[0]]);
  }
  return units
    .map((unit, i) => {
      const v = parts[unit];
      if (i === 0) return String(v);
      if (unit === "s") {
        const whole = Math.floor(v);
        const frac = v - whole;
        return frac > 0 ? `${pad2(whole)}${v.toFixed(secondsDecimals).slice(String(whole).length)}` : pad2(whole);
      }
      return pad2(v);
    })
    .join(":");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/utils/timeValue.test.ts`
Expected: PASS (all groups). If the fractional-seconds padding case (`5:03.5`) fails, adjust `formatDecimalToTime`'s seconds branch to build from `pad2(whole)` + `"." ` + the fixed fractional digits; the test is the contract.

- [ ] **Step 5: Commit**

```bash
git add src/utils/timeValue.ts src/utils/timeValue.test.ts
git commit -m "feat(dgt-19): add timeValue parse/format utility [DGT-19]"
```

---

### Task 2: `TimeInput` component

**Files:**
- Create: `src/components/logs/TimeInput.tsx`
- Create: `src/components/logs/TimeInput.module.css`
- Test: `src/components/logs/TimeInput.test.tsx`

**Interfaces:**
- Consumes: `timeValue` util (Task 1); `MetricDefinition` (`../../metrics/types`).
- Produces:
  - `interface TimeInputProps { metric: MetricDefinition; value: string; onChange: (next: string) => void; labelledBy: string; secondsDecimals?: number }`
  - `function TimeInput(props: TimeInputProps): JSX.Element`
- Contract: `value` is `String(storedDecimal)` or `""`. `onChange` fires `String(decimal)` for a valid entry, `""` when cleared. Invalid/ambiguous entries hold locally, show an inline error, and do NOT fire `onChange` (mirrors `useNumericLocalString`).

- [ ] **Step 1: Write the failing test**

`src/components/logs/TimeInput.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TimeInput } from "./TimeInput";
import type { MetricDefinition } from "../../metrics/types";

const SLEEP: MetricDefinition = {
  id: "sleepTime",
  name: "Total Sleep Time",
  unit: "hr/night",
  displayUnit: "hr",
  type: "health",
  whoCollects: "",
  howCollected: "",
  description: "",
  inputType: "numeric",
  timePrecision: "m",
};

function setup(value = "") {
  const onChange = vi.fn();
  const utils = render(
    <TimeInput metric={SLEEP} value={value} onChange={onChange} labelledBy="lbl" />,
  );
  const inputs = () => utils.container.querySelectorAll("input");
  return { onChange, inputs, ...utils };
}

describe("TimeInput (h:mm)", () => {
  it("seeds sub-fields from a stored decimal", () => {
    const { inputs } = setup("8.6667");
    const [h, m] = inputs();
    expect((h as HTMLInputElement).value).toBe("8");
    expect((m as HTMLInputElement).value).toBe("40");
  });

  it("fires String(decimal) when both fields are set", () => {
    const { inputs, onChange } = setup();
    const [h, m] = inputs();
    fireEvent.change(h, { target: { value: "8" } });
    fireEvent.change(m, { target: { value: "30" } });
    expect(Number(onChange.mock.calls.at(-1)![0])).toBeCloseTo(8.5, 6);
  });

  it("normalizes a coarsest decimal into the split on blur", () => {
    const { inputs, onChange } = setup();
    const [h, m] = inputs();
    fireEvent.change(h, { target: { value: "8.5" } });
    fireEvent.blur(h);
    expect((h as HTMLInputElement).value).toBe("8");
    expect((m as HTMLInputElement).value).toBe("30");
    expect(Number(onChange.mock.calls.at(-1)![0])).toBeCloseTo(8.5, 6);
  });

  it("shows an error and does not fire onChange for an ambiguous mix", () => {
    const { inputs, onChange, container } = setup();
    const [h, m] = inputs();
    fireEvent.change(m, { target: { value: "40" } });
    onChange.mockClear();
    fireEvent.change(h, { target: { value: "8.5" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/whole number/i);
  });

  it("fires empty string when all fields cleared", () => {
    const { inputs, onChange } = setup("8.5");
    const [h, m] = inputs();
    fireEvent.change(h, { target: { value: "" } });
    fireEvent.change(m, { target: { value: "" } });
    expect(onChange.mock.calls.at(-1)![0]).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/logs/TimeInput.test.tsx`
Expected: FAIL — `Cannot find module './TimeInput'`.

- [ ] **Step 3: Write the implementation**

`src/components/logs/TimeInput.module.css`:
```css
.timeInput {
  display: flex;
  align-items: center;
  gap: 6px;
}

.field {
  background: var(--surface2);
  border: 1.5px solid #546888;
  border-radius: 6px;
  min-height: 44px;
  padding: 14px 8px;
  color: var(--text);
  font-family: var(--font-body);
  font-size: 16px;
  width: 56px;
  text-align: center;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.field.hasValue {
  border-color: rgba(0, 179, 192, 0.4);
}

.field.hasValue:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 179, 192, 0.18);
}

.sep {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--subtext);
}

.error {
  color: var(--error, #e53e3e);
  font-size: 13px;
  margin-top: 4px;
}
```

`src/components/logs/TimeInput.tsx`:
```tsx
import { useEffect, useState } from "react";
import clsx from "clsx";
import type { MetricDefinition } from "../../metrics/types";
import {
  resolveTimeLayout,
  parseTimeToDecimal,
  formatDecimalToFields,
  isAllEmpty,
  layoutUnits,
  type TimeFields,
  type TimeUnit,
} from "../../utils/timeValue";
import css from "./TimeInput.module.css";

export interface TimeInputProps {
  metric: MetricDefinition;
  value: string;
  onChange: (next: string) => void;
  labelledBy: string;
  // Decimal places shown in the seconds field on blur-normalization.
  // Defaults to 2; the log passes the metric's configured value.
  secondsDecimals?: number;
}

const UNIT_LABEL: Record<TimeUnit, string> = { h: "h", m: "m", s: "s" };

function seed(value: string, layout: ReturnType<typeof resolveTimeLayout>, secondsDecimals: number): TimeFields {
  if (!layout) return {};
  const n = value === "" ? NaN : Number(value);
  if (!Number.isFinite(n)) return {};
  return formatDecimalToFields(n, layout, secondsDecimals);
}

export function TimeInput({
  metric,
  value,
  onChange,
  labelledBy,
  secondsDecimals = 2,
}: TimeInputProps) {
  const layout = resolveTimeLayout(metric);
  const [fields, setFields] = useState<TimeFields>(() => seed(value, layout, secondsDecimals));
  const [error, setError] = useState<string | null>(null);

  // Reconcile from the parent only when it changes to a value that
  // doesn't round-trip to the current fields (cross-tab edit, reset).
  useEffect(() => {
    if (!layout) return;
    const current = parseTimeToDecimal(fields, layout);
    const parent = value === "" ? null : Number(value);
    const same =
      (parent === null && current === null) ||
      (parent !== null && current !== null && Math.abs(parent - current) < 1e-9);
    if (!same) setFields(seed(value, layout, secondsDecimals));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!layout) return null;
  const units = layoutUnits(layout);

  function update(unit: TimeUnit, raw: string) {
    // Allow only digits and a single dot while typing.
    if (raw !== "" && !/^[0-9]*\.?[0-9]*$/.test(raw)) return;
    const next = { ...fields, [unit]: raw };
    setFields(next);
    if (isAllEmpty(next, layout!)) {
      setError(null);
      onChange("");
      return;
    }
    const parsed = parseTimeToDecimal(next, layout!);
    if (parsed === null) {
      setError("Enter a whole number in the larger field, or use the smaller field.");
      return; // hold local, don't fire
    }
    setError(null);
    onChange(String(parsed));
  }

  function normalizeOnBlur() {
    const parsed = parseTimeToDecimal(fields, layout!);
    if (parsed === null) return; // leave invalid state + error for the user to fix
    setError(null);
    setFields(formatDecimalToFields(parsed, layout!, secondsDecimals));
  }

  return (
    <div>
      <div className={css.timeInput} role="group" aria-labelledby={labelledBy}>
        {units.map((unit, i) => (
          <span key={unit} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span className={css.sep} aria-hidden="true">:</span>}
            <input
              type="text"
              inputMode="decimal"
              className={clsx(css.field, (fields[unit] ?? "") !== "" && css.hasValue)}
              value={fields[unit] ?? ""}
              aria-label={`${metric.name} ${UNIT_LABEL[unit]}`}
              onChange={(e) => update(unit, e.target.value)}
              onBlur={normalizeOnBlur}
            />
          </span>
        ))}
      </div>
      {error && <div className={css.error} role="alert">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/logs/TimeInput.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/logs/TimeInput.tsx src/components/logs/TimeInput.module.css src/components/logs/TimeInput.test.tsx
git commit -m "feat(dgt-19): add TimeInput multi-field time entry [DGT-19]"
```

---

### Task 3: Route numeric metrics with `timePrecision` to `TimeInput`

**Files:**
- Modify: `src/metrics/types.ts:13-62` (add `timePrecision?`)
- Modify: `src/components/logs/MetricInputRow.tsx:82-90` (route the numeric branch)
- Test: `src/components/logs/MetricInputRow.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `resolveTimeLayout` (Task 1), `TimeInput` (Task 2).
- Produces: `MetricDefinition.timePrecision?: TimeUnit`. No change to `MetricInputRowProps` — a `timePrecision` metric still passes `inputType: "numeric"` with a string `value`/`onChange`; `MetricInputRow` picks `TimeInput` vs `NumericInput` internally.

- [ ] **Step 1: Write the failing test**

`src/components/logs/MetricInputRow.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { MetricInputRow } from "./MetricInputRow";
import type { MetricDefinition } from "../../metrics/types";

const base = {
  name: "M",
  type: "health" as const,
  whoCollects: "",
  howCollected: "",
  description: "",
  inputType: "numeric" as const,
};

function renderRow(metric: MetricDefinition, value: string) {
  return render(
    <MemoryRouter>
      <table>
        <tbody>
          <MetricInputRow
            metric={metric}
            inputType="numeric"
            value={value}
            onChange={vi.fn()}
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
}

describe("MetricInputRow time routing", () => {
  it("renders two fields for a time metric (h:mm)", () => {
    const sleep: MetricDefinition = { ...base, id: "sleepTime", unit: "hr", displayUnit: "hr", timePrecision: "m" };
    const { container } = renderRow(sleep, "8.5");
    expect(container.querySelectorAll("input").length).toBe(2);
  });

  it("renders a single numeric input for a non-time metric", () => {
    const protein: MetricDefinition = { ...base, id: "protein", unit: "g", displayUnit: "g" };
    const { container } = renderRow(protein, "1.4");
    expect(container.querySelectorAll("input").length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/logs/MetricInputRow.test.tsx`
Expected: FAIL — `timePrecision` not assignable to `MetricDefinition`, and the time metric renders 1 input.

- [ ] **Step 3a: Add `timePrecision` to `MetricDefinition`**

In `src/metrics/types.ts`, add the import and field:
```ts
import type { TimeUnit } from "../utils/timeValue";
```
Inside `interface MetricDefinition`, after `schedule?: MetricSchedule;`:
```ts
  // Marks a numeric metric as a "time" metric. The finest field to
  // render; the coarsest is derived from the unit via normalizeTimeUnit.
  // Absent => plain numeric. See src/utils/timeValue.ts.
  timePrecision?: TimeUnit;
```

- [ ] **Step 3b: Route the numeric branch in `MetricInputRow`**

In `src/components/logs/MetricInputRow.tsx`, add imports:
```ts
import { TimeInput } from "./TimeInput";
import { resolveTimeLayout } from "../../utils/timeValue";
import { getMetricChartConfig } from "../../charts/metricChartConfig";
```
Replace the numeric branch (lines ~82-90):
```tsx
        {props.inputType === "numeric" &&
          (resolveTimeLayout(metric) ? (
            <TimeInput
              metric={metric}
              value={props.value}
              onChange={props.onChange}
              labelledBy={nameId}
              secondsDecimals={getMetricChartConfig(metric.id).avgDecimals ?? 2}
            />
          ) : (
            <NumericInput
              metric={metric}
              value={props.value}
              onChange={props.onChange}
              labelledBy={nameId}
              allowNegative={props.allowNegative}
            />
          ))}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/logs/MetricInputRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run build`
Expected: no TypeScript errors.
```bash
git add src/metrics/types.ts src/components/logs/MetricInputRow.tsx src/components/logs/MetricInputRow.test.tsx
git commit -m "feat(dgt-19): route timePrecision metrics to TimeInput [DGT-19]"
```

---

### Task 4: Annotate built-in time metrics + thread `timePrecision` through custom adapters

**Files:**
- Modify: `src/metrics/healthMetrics.ts:48-79` (sleepTime)
- Modify: `src/metrics/addableMetrics.ts` (oneMileRun `:193-207`, tenMeterSprint `:208-222`, fortyYardDash `:223-237`)
- Modify: `src/metrics/competitionMetrics.ts:49-58` (times)
- Modify: `src/types/customMetrics.ts:26-60` (add `timePrecision?`)
- Modify: `src/metrics/customMetricDefinition.ts:11-27` (`customAsMetricDefinition`)
- Modify: `src/components/logs/HealthLog.tsx:136-146` (`adaptCustom`)
- Test: `src/components/logs/HealthLog.test.tsx` (extend)

**Interfaces:**
- Consumes: `MetricDefinition.timePrecision` (Task 3), `CustomMetricDef` shape.
- Produces: `CustomMetricDef.timePrecision?: TimeUnit`; built-in registries carry `timePrecision`; both custom→MetricDefinition adapters forward it.

- [ ] **Step 1: Write the failing test**

Extend `src/components/logs/HealthLog.test.tsx` with a redisplay assertion (adapt the existing render helper in that file; the key assertion is that a stored `sleepTime` renders two fields seeded to h/m):
```tsx
it("renders sleepTime as two time fields seeded from the stored decimal", async () => {
  // Uses the file's existing harness to mount HealthLog with a health
  // entry whose sleepTime is 8.5. Adjust to match the file's setup.
  const { container } = renderHealthLog({ sleepTime: 8.5 });
  const sleepRow = container.querySelector('[data-testid="row-sleepTime"]') ?? container;
  const inputs = sleepRow.querySelectorAll("input");
  expect(inputs.length).toBeGreaterThanOrEqual(2);
  expect((inputs[0] as HTMLInputElement).value).toBe("8");
  expect((inputs[1] as HTMLInputElement).value).toBe("30");
});
```
Note: if `HealthLog.test.tsx` lacks a reusable `renderHealthLog`, add a minimal one following the file's existing mocking of `DataContext`/providers. The assertion — two fields seeded `8` / `30` for `sleepTime: 8.5` — is the contract.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/logs/HealthLog.test.tsx`
Expected: FAIL — sleepTime still renders a single numeric input (`timePrecision` not yet set).

- [ ] **Step 3a: Add `timePrecision` to `CustomMetricDef`**

`src/types/customMetrics.ts` — add import and field:
```ts
import type { TimeUnit } from "../utils/timeValue";
```
Inside `interface CustomMetricDef`, after `unit?: string;`:
```ts
  // Time metric: finest field to render. Coarsest is derived from `unit`
  // (canonical hr/min/sec set by the form). Absent => plain numeric.
  timePrecision?: TimeUnit;
```

- [ ] **Step 3b: Annotate built-in registries**

`src/metrics/healthMetrics.ts` — in the `sleepTime` object, add `timePrecision: "m",` (next to `inputType: "numeric"`).

`src/metrics/addableMetrics.ts`:
- `oneMileRun`: add `timePrecision: "s",` (unit `min` -> `m:ss`).
- `tenMeterSprint`: add `timePrecision: "s",` (unit `sec` -> single seconds field).
- `fortyYardDash`: add `timePrecision: "s",`.

`src/metrics/competitionMetrics.ts` — in the `times` object, add `timePrecision: "s",` (unit `min` -> `m:ss`), and remove the stale "Unit selection (h/m/s) is a follow-up" comment.

- [ ] **Step 3c: Forward `timePrecision` in both custom adapters**

`src/metrics/customMetricDefinition.ts` — in the returned object of `customAsMetricDefinition`, add:
```ts
    timePrecision: def.timePrecision,
```

`src/components/logs/HealthLog.tsx` — in the inline `adaptCustom` return object (lines 136-146), add:
```ts
    timePrecision: def.timePrecision,
```
(Also add `displayUnit: def.unit ?? "",` remains as-is; `unit` stays the custom's canonical unit so `resolveTimeLayout` maps it.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/logs/HealthLog.test.tsx`
Expected: PASS. Then run the full suite for regressions: `npm test`
Expected: all green.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run build`
```bash
git add src/metrics/healthMetrics.ts src/metrics/addableMetrics.ts src/metrics/competitionMetrics.ts src/types/customMetrics.ts src/metrics/customMetricDefinition.ts src/components/logs/HealthLog.tsx src/components/logs/HealthLog.test.tsx
git commit -m "feat(dgt-19): mark built-in time metrics; thread timePrecision to custom adapters [DGT-19]"
```

---

### Task 4b: Route time metrics in Competition + Performance logs

**Why this exists:** `CompetitionLog` and `PerformanceLog` do NOT use `MetricInputRow` (only `HealthLog` does). They render their own `<tr>` rows and use the shared `CompetitionMetricInput` (a thin `useNumericLocalString` wrapper). So the Task-3 routing never reaches the competition/performance time metrics (`times`, `oneMileRun`, `tenMeterSprint`, `fortyYardDash`). This task adds the same time-vs-numeric decision in those two logs.

**Files:**
- Modify: `src/components/logs/CompetitionLog.tsx` (record-cell render, ~lines 240-251)
- Modify: `src/components/logs/PerformanceLog.tsx` (record-cell render, ~lines 183-196)
- Test: `src/components/logs/CompetitionLog.test.tsx` and `src/components/logs/PerformanceLog.test.tsx` (extend)

**Interfaces:**
- Consumes: `TimeInput` (Task 2), `resolveTimeLayout` (Task 1), `customAsMetricDefinition` (Task 4, now forwards `timePrecision`), `getMetricChartConfig` (existing). Both logs already have `builtInById` and `customById` maps in scope.
- Produces: no new exports. A built-in time metric (`oneMileRun`, `tenMeterSprint`, `fortyYardDash`, `times`) and custom time metrics of these types render `TimeInput` in their logs.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/logs/CompetitionLog.test.tsx` a test asserting the `times` row renders 2 inputs (m:ss) after Task 4's annotation. Follow the file's existing render harness (it already mounts `CompetitionLog` with providers). Concrete contract:
```tsx
it("renders competition 'times' as a two-field time input", () => {
  const { container } = renderCompetitionLog();      // file's existing harness
  const row = container.querySelector('[data-metric-row="times"]') ?? container;
  // times is m:ss -> two inputs; a non-time metric like 'goals' stays single.
  expect(row.querySelectorAll("input").length).toBeGreaterThanOrEqual(2);
});
```
Append the analogous test to `src/components/logs/PerformanceLog.test.tsx` for `oneMileRun` (m:ss, 2 inputs) and, if convenient, `tenMeterSprint` (single seconds input, 1 input). Match each file's existing harness rather than inventing a new one; the contract is the input count per metric.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/logs/CompetitionLog.test.tsx src/components/logs/PerformanceLog.test.tsx`
Expected: FAIL — those rows currently render one `CompetitionMetricInput`.

- [ ] **Step 3: Add time routing in both logs**

Add imports to BOTH `CompetitionLog.tsx` and `PerformanceLog.tsx`:
```ts
import { TimeInput } from "./TimeInput";
import { resolveTimeLayout } from "../../utils/timeValue";
import { customAsMetricDefinition } from "../../metrics/customMetricDefinition";
import { getMetricChartConfig } from "../../charts/metricChartConfig";
import type { MetricDefinition } from "../../metrics/types";
```
In `CompetitionLog.tsx`, in the record-cell IIFE, AFTER the ordinal/nominal guards and BEFORE the `return <CompetitionMetricInput .../>` (the `builtInDef` const already exists at ~line 161; `customDef` too):
```tsx
                      const timeMeta: MetricDefinition | undefined =
                        builtInDef ??
                        (customDef
                          ? customAsMetricDefinition(customDef, "competition")
                          : undefined);
                      if (timeMeta && resolveTimeLayout(timeMeta)) {
                        return (
                          <TimeInput
                            metric={timeMeta}
                            value={stringValue}
                            onChange={(raw) => setMetricValue(metric.id, raw)}
                            labelledBy={nameCellId}
                            secondsDecimals={getMetricChartConfig(metric.id).avgDecimals ?? 2}
                          />
                        );
                      }
```
In `PerformanceLog.tsx`, do the same, but first add `const builtInDef = builtInById.get(metric.id);` at the top of the record-cell IIFE (the file currently only reads `customDef` there), and use `"performance"` in the `customAsMetricDefinition` call.

Optionally add `data-metric-row={metric.id}` to each row's `<tr>` (or an existing wrapper) if the tests key on it; otherwise scope the test by the metric's link text.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/logs/CompetitionLog.test.tsx src/components/logs/PerformanceLog.test.tsx`
Expected: PASS. Then `npm test` for the full suite.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run build`
```bash
git add src/components/logs/CompetitionLog.tsx src/components/logs/PerformanceLog.tsx src/components/logs/CompetitionLog.test.tsx src/components/logs/PerformanceLog.test.tsx
git commit -m "feat(dgt-19): route time metrics in competition + performance logs [DGT-19]"
```

---

### Task 5: Chart formatting for time metrics

**Files:**
- Modify: `src/charts/metricChartConfig.ts` (add `timeLayout`; time `formatValue`; `SLEEP_TIME`; `competitionConfig`/`performanceConfig` signatures + CONFIG entries; `customDefToChartConfig`)
- Modify: `src/charts/chartSeries.ts:57-63` (`formatMetricValue` skip pre-round for time)
- Modify: `src/charts/Bars.tsx:58-62` (skip pre-round for time)
- Test: `src/charts/metricChartConfig.test.ts` (extend)

**Interfaces:**
- Consumes: `formatDecimalToTime`, `resolveTimeLayout`, `type TimeLayout` (Task 1); `CustomMetricDef.timePrecision` (Task 4).
- Produces: `MetricChartConfig.timeLayout?: TimeLayout`. When set, `formatValue` renders a time string and `unit` is `undefined`.

- [ ] **Step 1: Write the failing test**

Extend `src/charts/metricChartConfig.test.ts`:
```ts
import { getMetricChartConfig, customDefToChartConfig } from "./metricChartConfig";
import { formatMetricValue } from "./chartSeries";

describe("time metric chart formatting", () => {
  it("sleepTime formats as h:mm with no unit suffix", () => {
    const c = getMetricChartConfig("sleepTime");
    expect(c.timeLayout).toEqual({ coarsest: "h", precision: "m" });
    expect(c.unit).toBeUndefined();
    expect(c.formatValue(8.5)).toBe("8:30");
    expect(formatMetricValue("sleepTime", 8.5)).toBe("8:30");
  });

  it("oneMileRun formats as m:ss", () => {
    const c = getMetricChartConfig("oneMileRun");
    expect(c.formatValue(5.5)).toBe("5:30");
  });

  it("a custom time metric formats via its layout and secondsDecimals", () => {
    const c = customDefToChartConfig({
      id: "cx", ownerId: "u", name: "400m", metricType: "performance",
      primitive: "numeric", inputType: "numeric",
      unit: "min", timePrecision: "s", avgDecimals: 1,
      goalRaw: 1, yTopRaw: 2, yBottomRaw: 0, referenceUrl: "",
      createdAt: 0, updatedAt: 0,
    });
    expect(c.timeLayout).toEqual({ coarsest: "m", precision: "s" });
    expect(c.formatValue(1 + 3.45 / 60)).toBe("1:03.5");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/charts/metricChartConfig.test.ts`
Expected: FAIL — `timeLayout` undefined; `formatValue(8.5)` returns `"8.5"`.

- [ ] **Step 3a: Add `timeLayout` + a time-config helper in `metricChartConfig.ts`**

Add imports near the top:
```ts
import { formatDecimalToTime, resolveTimeLayout, type TimeLayout } from "../utils/timeValue";
```
Add to `interface MetricChartConfig` (after `unit?`):
```ts
  // When set, this metric renders as a time. formatValue returns a
  // formatted time string (e.g. "5:30") and `unit` is left undefined so
  // consumers append no suffix. avgDecimals doubles as the seconds
  // decimal places.
  timeLayout?: TimeLayout;
```
Add a helper to build a time formatValue (place near `fmtRaw`):
```ts
function timeFormatValue(layout: TimeLayout, secondsDecimals: number) {
  return (v: number) => formatDecimalToTime(v, layout, secondsDecimals);
}
```

- [ ] **Step 3b: Make `SLEEP_TIME` a time config**

Replace the `SLEEP_TIME` object's `formatValue`/`unit` with a time layout:
```ts
const SLEEP_TIME_LAYOUT: TimeLayout = { coarsest: "h", precision: "m" };
const SLEEP_TIME: MetricChartConfig = {
  chartType: "bar",
  yTopRaw: 10,
  yBottomRaw: 0,
  goalRaw: 8,
  timeLayout: SLEEP_TIME_LAYOUT,
  formatValue: timeFormatValue(SLEEP_TIME_LAYOUT, 0), // whole minutes; no seconds component
  random: (rng) => randomFloat(rng, 6, 10, 1),
};
```

- [ ] **Step 3c: Add an optional `timePrecision` to `competitionConfig`/`performanceConfig`**

`competitionConfig` — extend the signature and body:
```ts
function competitionConfig(
  yBottomRaw: number,
  yTopRaw: number,
  unit?: string,
  timePrecision?: "h" | "m" | "s",
): MetricChartConfig {
  const layout = timePrecision ? resolveTimeLayout({ unit, timePrecision }) : null;
  return {
    chartType: "bar",
    yTopRaw,
    yBottomRaw,
    formatValue: layout ? timeFormatValue(layout, 0) : fmtRaw,
    unit: layout ? undefined : unit,
    timeLayout: layout ?? undefined,
    random: (rng) => randomInt(rng, yBottomRaw, yTopRaw),
  };
}
```
`performanceConfig` — same treatment:
```ts
function performanceConfig(
  yBottomRaw: number,
  yTopRaw: number,
  unit?: string,
  lowerIsBetter?: boolean,
  timePrecision?: "h" | "m" | "s",
): MetricChartConfig {
  const layout = timePrecision ? resolveTimeLayout({ unit, timePrecision }) : null;
  return {
    chartType: "bar",
    yTopRaw,
    yBottomRaw,
    lowerIsBetter,
    formatValue: layout ? timeFormatValue(layout, 0) : fmtRaw,
    unit: layout ? undefined : unit,
    timeLayout: layout ?? undefined,
    random: (rng) => randomFloat(rng, yBottomRaw, yTopRaw, 1),
  };
}
```
Update the CONFIG entries:
```ts
  times: competitionConfig(0, 60, "min", "s"),
  oneMileRun: performanceConfig(4, 15, "min", true, "s"),
  tenMeterSprint: performanceConfig(1, 3, "sec", true, "s"),
  fortyYardDash: performanceConfig(4.2, 10, "sec", true, "s"),
```

- [ ] **Step 3d: `customDefToChartConfig` — time branch**

At the top of `customDefToChartConfig`, after `decimals` is computed, resolve a layout and short-circuit `formatValue`/`unit`:
```ts
  const timeLayout = resolveTimeLayout({ unit: def.unit, timePrecision: def.timePrecision });
```
Then in the returned object, replace `formatValue`/`unit` with time-aware versions and add `timeLayout`:
```ts
    formatValue: timeLayout
      ? (v) => formatDecimalToTime(v, timeLayout, decimals)
      : isPct
        ? (v) => `${formatNumber(v)}%`
        : formatNumber,
    unit: timeLayout ? undefined : isPct ? undefined : def.unit || undefined,
    timeLayout: timeLayout ?? undefined,
```

- [ ] **Step 3e: Skip coarse-unit pre-rounding for time in `formatMetricValue` and `Bars`**

`src/charts/chartSeries.ts` `formatMetricValue`:
```ts
export function formatMetricValue(metricId: string, raw: number): string {
  const config = getMetricChartConfig(metricId);
  if (config.timeLayout) return config.formatValue(raw); // no pre-round, no unit suffix
  const decimals = config.avgDecimals ?? 1;
  const rounded = Number(raw.toFixed(decimals));
  const formatted = config.formatValue(rounded);
  return config.unit ? `${formatted} ${config.unit}` : formatted;
}
```
`src/charts/Bars.tsx` (lines 58-59):
```tsx
        const decimals = config.avgDecimals ?? 1;
        const rounded = config.timeLayout ? d.value : Number(d.value.toFixed(decimals));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/charts/metricChartConfig.test.ts`
Expected: PASS. Then `npm test` for regressions across charts.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run build`
```bash
git add src/charts/metricChartConfig.ts src/charts/metricChartConfig.test.ts src/charts/chartSeries.ts src/charts/Bars.tsx
git commit -m "feat(dgt-19): format time metrics on charts via timeLayout [DGT-19]"
```

---

### Task 6: Custom-metric form — Time sub-format

**Files:**
- Modify: `src/components/tracking/CustomMetricForm.tsx` (Format control, canonical unit + precision, Decimals greying, `buildPayload`, edit-confirm)
- Modify: `src/contexts/CustomMetricsContext.tsx` (persistence gap found during execution: `addMetric`'s `writePayload` whitelist and `fromFirestore` reader both omit `timePrecision`, so a new custom time metric loses it on first save/reload — add write + validated read)
- Test: `src/components/tracking/CustomMetricForm.test.tsx` (extend)

**Interfaces:**
- Consumes: `CustomMetricDef.timePrecision` (Task 4); `TimeUnit` (Task 1); `customDefToChartConfig` time branch (Task 5).
- Produces: a numeric custom metric with `Format = Time` saves `timePrecision` + a canonical `unit` (`hr`/`min`/`sec`).

- [ ] **Step 1: Write the failing test**

Extend `src/components/tracking/CustomMetricForm.test.tsx` (follow the file's existing render/save harness):
```tsx
it("saves a time custom metric with timePrecision and a canonical unit", async () => {
  // Render the create form for a performance metric, choose Numeric,
  // switch Format to Time, pick Unit=min, Precision=sec, enter a name,
  // and submit. The saved payload must carry timePrecision and unit.
  const saved = await fillAndSaveTimeMetric({
    name: "400m Time",
    unit: "min",
    precision: "s",
  });
  expect(saved.timePrecision).toBe("s");
  expect(saved.unit).toBe("min");
  expect(saved.primitive).toBe("numeric");
});
```
Note: implement `fillAndSaveTimeMetric` against the file's existing helpers (it already mounts the form and captures `addMetric`). The contract is: Format=Time + Unit=min + Precision=sec yields `{ primitive: "numeric", unit: "min", timePrecision: "s" }`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/tracking/CustomMetricForm.test.tsx`
Expected: FAIL — there is no Format/Time control; payload has no `timePrecision`.

- [ ] **Step 3a: Extend `DraftState` + `EMPTY_DRAFT`**

Add to `interface DraftState`:
```ts
  numericFormat: "number" | "time";
  timeUnit: "hr" | "min" | "sec";
  timePrecision: "m" | "s";
```
Add to `EMPTY_DRAFT`:
```ts
  numericFormat: "number",
  timeUnit: "min",
  timePrecision: "s",
```
Seed from an edited metric in the `useState` initializer (after `unit:`):
```ts
      numericFormat: editing.timePrecision ? "time" : "number",
      timeUnit: (editing.unit as "hr" | "min" | "sec") || "min",
      timePrecision: editing.timePrecision === "m" ? "m" : "s",
```

- [ ] **Step 3b: Render the Format control (only when topLevel === "numeric")**

Add below the Type chooser fieldset, guarded by `draft.topLevel === "numeric"`, using `<If condition={draft.topLevel === "numeric"}>`:
```tsx
      <If condition={draft.topLevel === "numeric"}>
        <fieldset className={css.typeChooser}>
          <legend className={css.typeChooserLegend}>Format</legend>
          <label className={css.typeOption}>
            <input type="radio" className={radioCss.radio} name="cm-format" value="number"
              checked={draft.numericFormat === "number"}
              onChange={() => update("numericFormat", "number")} />
            Number
          </label>
          <label className={css.typeOption}>
            <input type="radio" className={radioCss.radio} name="cm-format" value="time"
              checked={draft.numericFormat === "time"}
              onChange={() => update("numericFormat", "time")} />
            Time
          </label>
        </fieldset>
      </If>

      <If condition={draft.topLevel === "numeric" && draft.numericFormat === "time"}>
        <div className={css.row}>
          <label className={css.fieldLabel}>
            Unit
            <select value={draft.timeUnit}
              onChange={(e) => {
                const u = e.target.value as "hr" | "min" | "sec";
                // Keep precision <= unit: hr allows m/s, min allows s, sec forces s.
                const p = u === "sec" ? "s" : draft.timePrecision;
                setDraft((prev) => ({ ...prev, timeUnit: u, timePrecision: p }));
              }}>
              <option value="hr">hr</option>
              <option value="min">min</option>
              <option value="sec">sec</option>
            </select>
          </label>
          <label className={css.fieldLabel}>
            Precision
            <select value={draft.timePrecision}
              disabled={draft.timeUnit === "sec"}
              onChange={(e) => update("timePrecision", e.target.value as "m" | "s")}>
              {draft.timeUnit === "hr" && <option value="m">minutes</option>}
              <option value="s">seconds</option>
            </select>
          </label>
        </div>
      </If>
```

- [ ] **Step 3c: Grey Unit + Decimals appropriately**

Update the disabled flags near line 584:
```ts
  const isTime = draft.topLevel === "numeric" && draft.numericFormat === "time";
  const unitDisabled = draft.topLevel !== "numeric" || isTime; // time derives its unit from the selects
  const decimalsDisabled =
    draft.topLevel === "yn" || (isTime && draft.timePrecision === "m");
```
(The free-form Unit `<TextField>` stays rendered but disabled for time; the canonical unit comes from `draft.timeUnit`.)

- [ ] **Step 3d: Set `timePrecision` + canonical unit in `buildPayload`**

In the `draft.topLevel === "numeric"` branch of `buildPayload`, compute time fields and include them:
```ts
    const isTime = draft.numericFormat === "time";
    const resolvedUnit = isTime ? draft.timeUnit : draft.unit.trim();
    return {
      name: trimmedName,
      metricType: type,
      primitive: "numeric",
      inputType: "numeric",
      unit: resolvedUnit,
      ...(isTime ? { timePrecision: draft.timePrecision } : {}),
      goalRaw,
      yTopRaw,
      yBottomRaw,
      avgDecimals,
      referenceUrl: trimmedRef,
    };
```
(`buildPayload` reads `draft` already; thread `draft` in if the current signature only passes individual fields — it takes `draft` per `buildPayload(draft, ...)`.)

- [ ] **Step 3e: Edit-confirmation includes `timePrecision`**

In `handleSubmit`'s edit path, extend the change detection:
```ts
        const timePrecisionChanged =
          (payload.timePrecision ?? undefined) !== (editing.timePrecision ?? undefined);
        const dataShapingChanged =
          inputTypeChanged || unitChanged || levelsChanged || timePrecisionChanged;
```
and add `timePrecisionChanged ? "time precision" : null` to the `fields` list joined into the confirm prompt.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/tracking/CustomMetricForm.test.tsx`
Expected: PASS. Then `npm test` for regressions.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run build`
```bash
git add src/components/tracking/CustomMetricForm.tsx src/components/tracking/CustomMetricForm.test.tsx
git commit -m "feat(dgt-19): add Time format to the custom-metric form [DGT-19]"
```

---

### Task 7: Time-aware goal & y-axis in the built-in override form

**Files:**
- Modify: `src/components/tracking/MetricOverrideForm.tsx` (render `TimeInput` for goal + y-axis when the metric has `timePrecision`; parse via the util)
- Test: `src/components/tracking/MetricOverrideForm.test.tsx` (create or extend)

**Interfaces:**
- Consumes: `TimeInput` (Task 2); `resolveTimeLayout`, `parseTimeToDecimal` (Task 1). The form's state stays `string` (`goalRaw`/`yTopRaw`/`yBottomRaw`); storage stays `number`.

- [ ] **Step 1: Write the failing test**

`src/components/tracking/MetricOverrideForm.test.tsx` (extend if present):
```tsx
// @vitest-environment jsdom
it("renders the goal as a time input for a time metric and round-trips", () => {
  // Mount MetricOverrideForm for sleepTime (timePrecision: "m").
  // The Goal control should render two time fields, not one number input.
  const { container } = renderOverrideForm("sleepTime");
  const goal = container.querySelector('[data-testid="mo-goal"]') ?? container;
  expect(goal.querySelectorAll("input").length).toBeGreaterThanOrEqual(2);
});
```
Note: follow the file's existing provider mocks. Contract: a `timePrecision` metric renders the Goal (and each y-axis bound) as a `TimeInput`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/tracking/MetricOverrideForm.test.tsx`
Expected: FAIL — Goal renders a single `<input type="number">`.

- [ ] **Step 3: Render `TimeInput` for time metrics**

In `src/components/tracking/MetricOverrideForm.tsx` add imports:
```ts
import { TimeInput } from "../logs/TimeInput";
import { resolveTimeLayout } from "../../utils/timeValue";
```
Compute once in the component body:
```ts
  const isTime = resolveTimeLayout(metric) !== null;
```
Replace the Goal `<TextField>` (lines ~195-203) with a conditional:
```tsx
      {isTime ? (
        <div data-testid="mo-goal">
          <label className={css.fieldLabel} id="mo-goal-label">Goal</label>
          <TimeInput metric={metric} value={goalRaw} onChange={setGoalRaw} labelledBy="mo-goal-label" />
        </div>
      ) : (
        <TextField
          id="mo-goal" label="Goal" type="number" inputMode="decimal" step="any"
          value={goalRaw} onChange={(e) => setGoalRaw(e.target.value)}
        />
      )}
```
Replace each y-axis `<TextField>` (lines ~206-225) with the same pattern (`TimeInput` when `isTime`, keyed labels `mo-ytop-label` / `mo-ybot-label`, wiring `setYTopRaw` / `setYBottomRaw`).

Because `TimeInput` already emits `String(decimal)` (or `""`), the existing `Number(goalRaw)` / `Number(yTopRaw)` parse+validation block (lines 87-145) works unchanged — a `timePrecision` metric has no `min`/`max` string-format issue since the stored strings are plain decimals.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/tracking/MetricOverrideForm.test.tsx`
Expected: PASS. Then `npm test` for the full suite.

- [ ] **Step 5: Typecheck, manual check, commit**

Run: `npm run build`
Manual: `npm run dev`, open a tracked time metric's log row and its goal/override screen; confirm entry, blur-normalization, and the chart axis/average render as times (compare against the prototype). Fix any visual gaps in `TimeInput.module.css`.
```bash
git add src/components/tracking/MetricOverrideForm.tsx src/components/tracking/MetricOverrideForm.test.tsx
git commit -m "feat(dgt-19): time-aware goal and y-axis in override form [DGT-19]"
```

---

## Self-Review

**Spec coverage:**
- Multi-field entry, per-metric field set → Tasks 1-4 (`timePrecision` + `TimeInput` + routing).
- `08:40` / `8:40` / `8.6` valid; blur normalization; ambiguous-mix rejection → Task 1 (util) + Task 2 (`TimeInput`). Colon-paste: the per-field filter in `TimeInput.update` currently blocks `:`; ADD a paste split — see Gap 1 below.
- Redisplay in time format → Task 2 (`seed`) + Task 4 (built-in annotations, adapters).
- Charts show times (axis, average, goal badge) → Task 5 (`timeLayout` baked into `formatValue`; `formatMetricValue`/`Bars` pre-round skip).
- Goals + y-axis as time inputs → Task 6 (custom form) + Task 7 (built-in override form).
- Custom metrics can be time metrics → Tasks 4 (type), 5 (chart), 6 (form).
- `avgDecimals` → `secondsDecimals` → Task 1 (util param), Task 3 (input wiring), Task 5 (charts), Task 6 (Decimals greying).
- No CODAP work → correctly absent (DGT-77).

**Gap 1 (fix during Task 2):** the spec requires pasting `8:40` into a field to split across fields. `TimeInput.update`'s `/^[0-9]*\.?[0-9]*$/` filter blocks `:`. Add: if `raw` contains `:`, split on `:` and distribute across the layout's fields (coarsest-first), then normalize. Add a test to `TimeInput.test.tsx`:
```tsx
it("splits a pasted h:mm into fields", () => {
  const { inputs, onChange } = setup();
  fireEvent.change(inputs()[0], { target: { value: "8:40" } });
  expect(Number(onChange.mock.calls.at(-1)![0])).toBeCloseTo(8 + 40 / 60, 6);
});
```
Implement by special-casing a `:` in `update` before the numeric filter.

**Placeholder scan:** test harness helpers (`renderHealthLog`, `fillAndSaveTimeMetric`, `renderOverrideForm`) are named against each test file's existing setup rather than reproduced — each note states the concrete contract to assert, which is the intended latitude for matching a file's existing harness, not a content placeholder in product code. All product-code steps show complete code.

**Type consistency:** `TimeUnit`/`TimeLayout`/`TimeFields` are defined once in `timeValue.ts` and imported everywhere. `timePrecision` is `TimeUnit` on both `MetricDefinition` and `CustomMetricDef`. The custom form's local `timePrecision` is narrowed to `"m" | "s"` (a superset-safe subset of `TimeUnit`) and assigned into the `TimeUnit` field on save. `timeLayout` on `MetricChartConfig` matches the util's `TimeLayout`. Adapter field name is `customAsMetricDefinition` (not `customMetricDefinition`).

**Verification:** every task ends with `npm run build` (tsc -b) before commit; Task 7 adds a dev-server visual check.
