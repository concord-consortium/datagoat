# DGT-85 Metric-Value Accessor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a single metric-value accessor over the three existing DataContext storage shapes (health named fields, health `customMetrics`, perf/comp `metrics`), so reads, writes, and "is filled" logic route through one migration-ready seam, and fix the DGT-80 nominal-custom count inflation.

**Architecture:** A pure `resolveStorage(tracked)` descriptor is the single place that enumerates per-metric storage variation. Pure `getMetricValue` / `scalarFilled` / `isMetricFilled` / `resolveWrite` build on it; a thin `useMetricWriter` hook binds the write side to DataContext's setters. A separate `metricRendersRow` predicate (rendering-capability, not storage) is shared by the section counter and the row dispatcher so the count and the rendered rows cannot disagree. The two existing row components and the chip resolver are rewired to consume the accessor; the row components are NOT merged (that is DGT-85 item 2, a separate spec).

**Tech Stack:** React 19 + TypeScript + Vite. Vitest (`vitest run`) with `@testing-library/react`. Firestore via `DataContext`.

**Design spec:** `docs/superpowers/specs/2026-07-20-dgt-85-metric-accessor-design.md`

## Global Constraints

- **No em dashes in new code or comments** - use regular hyphens. (Existing `—` glyphs that are rendered *content*, e.g. the empty-value glyph, stay.)
- **No ticket IDs in source comments.** Keep `DGT-85` in commit subjects / branch, never in code.
- **Named imports stay alphabetically ordered** within an import statement.
- **Conventional Commit subjects with the Jira key suffixed:** `feat(logs): add metric-value accessor [DGT-85]`.
- **Verify types with `npx tsc -b`** (build mode), not `tsc --noEmit` - CI runs build mode and catches errors `--noEmit` misses.
- **Preserve delete semantics:** a `value` of `undefined` must reach `set*Entry` as `undefined` so `withDeleteSentinels` deletes the field. Never coerce it.
- **Parsing stays at the widget boundary:** raw-string -> `number | string` parsing stays in the row/widget layer (via `parseNumericInput`). The accessor takes an already-typed value.
- **Do not restructure the row widget branching.** The built-in-ordinal vs custom-ordinal split (built-in ordinals always render as `ScaleCards`; only custom ordinals check `isYesNoLevels`) and the health-only widgets (hydration color scale, availability tree, `relativeProteinIntake` placeholder) are out of scope here - only value read/write is rerouted.
- **Branch:** `DGT-85-metric-accessor` (already created off `origin/main`).
- Run a single test file with `npx vitest run <path>`; the full suite with `npm test`.

---

### Task 1: Storage descriptor + read (`resolveStorage`, `getMetricValue`, `scalarFilled`)

**Files:**
- Create: `src/metrics/metricAccessor.ts`
- Test: `src/metrics/metricAccessor.test.ts`

**Interfaces:**
- Consumes: `TrackedMetric` (type-only, from `../components/logs/useTrackedMetrics`); `CompetitionEntry`, `HealthEntry`, `PerformanceEntry` (from `../types/data`).
- Produces:
  - `type HealthNamedField = "hydration" | "sleepTime" | "sleepEfficiency" | "protein" | "leanMass"`
  - `const NAMED_HEALTH_FIELDS: readonly HealthNamedField[]`
  - `type MetricEntry = HealthEntry | PerformanceEntry | CompetitionEntry`
  - `type StorageLoc = { kind: "healthNamed"; field: HealthNamedField } | { kind: "healthCustom" } | { kind: "map" }`
  - `function resolveStorage(tracked: TrackedMetric): StorageLoc`
  - `function getMetricValue(tracked: TrackedMetric, entry: MetricEntry): number | string | undefined`
  - `function scalarFilled(value: number | string | undefined): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  getMetricValue,
  resolveStorage,
  scalarFilled,
} from "./metricAccessor";
import type { TrackedMetric } from "../components/logs/useTrackedMetrics";
import type { CompetitionEntry, HealthEntry, PerformanceEntry } from "../types/data";

function tracked(id: string, type: TrackedMetric["type"]): TrackedMetric {
  return { id, name: id, type, section: "daily" };
}

function health(patch: Partial<HealthEntry> = {}): HealthEntry {
  return { version: 1, date: "2026-07-20", availability: {}, ...patch };
}
function perf(metrics: PerformanceEntry["metrics"] = {}): PerformanceEntry {
  return { version: 1, date: "2026-07-20", metrics };
}
function comp(metrics: CompetitionEntry["metrics"] = {}): CompetitionEntry {
  return { version: 1, date: "2026-07-20", metrics };
}

describe("resolveStorage", () => {
  it("routes the five named health built-ins to their named field", () => {
    expect(resolveStorage(tracked("hydration", "health"))).toEqual({
      kind: "healthNamed",
      field: "hydration",
    });
    expect(resolveStorage(tracked("leanMass", "health"))).toEqual({
      kind: "healthNamed",
      field: "leanMass",
    });
  });

  it("routes any other health metric to the customMetrics map", () => {
    expect(resolveStorage(tracked("mood", "health"))).toEqual({ kind: "healthCustom" });
    expect(resolveStorage(tracked("myCustom", "health"))).toEqual({ kind: "healthCustom" });
  });

  it("routes performance and competition metrics to the map", () => {
    expect(resolveStorage(tracked("scores", "performance"))).toEqual({ kind: "map" });
    expect(resolveStorage(tracked("winningPercentage", "competition"))).toEqual({ kind: "map" });
  });
});

describe("getMetricValue", () => {
  it("reads a named health field", () => {
    expect(getMetricValue(tracked("hydration", "health"), health({ hydration: 4 }))).toBe(4);
  });
  it("reads a health custom from customMetrics", () => {
    expect(
      getMetricValue(tracked("mood", "health"), health({ customMetrics: { mood: 2 } })),
    ).toBe(2);
  });
  it("reads a perf/comp value from the metrics map", () => {
    expect(getMetricValue(tracked("scores", "performance"), perf({ scores: 10 }))).toBe(10);
    expect(getMetricValue(tracked("goals", "competition"), comp({ goals: "hat trick" }))).toBe(
      "hat trick",
    );
  });
  it("returns undefined for an unset value", () => {
    expect(getMetricValue(tracked("hydration", "health"), health())).toBeUndefined();
    expect(getMetricValue(tracked("scores", "performance"), perf())).toBeUndefined();
  });
});

describe("scalarFilled", () => {
  it("counts finite numbers including 0 as filled", () => {
    expect(scalarFilled(0)).toBe(true);
    expect(scalarFilled(-3)).toBe(true);
  });
  it("does not count NaN or undefined", () => {
    expect(scalarFilled(Number.NaN)).toBe(false);
    expect(scalarFilled(undefined)).toBe(false);
  });
  it("counts non-empty trimmed strings only", () => {
    expect(scalarFilled("x")).toBe(true);
    expect(scalarFilled("   ")).toBe(false);
    expect(scalarFilled("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/metrics/metricAccessor.test.ts`
Expected: FAIL - cannot resolve `./metricAccessor` / exports not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/metrics/metricAccessor.ts
import type { TrackedMetric } from "../components/logs/useTrackedMetrics";
import type { CompetitionEntry, HealthEntry, PerformanceEntry } from "../types/data";

// The five health built-ins stored as named fields on HealthEntry. Every
// other health metric (built-in Mood, all customs) lives in the customMetrics
// map. This list is the whole difference between the two health storage kinds,
// and the seam that collapses when storage is later unified.
export type HealthNamedField =
  | "hydration"
  | "sleepTime"
  | "sleepEfficiency"
  | "protein"
  | "leanMass";

export const NAMED_HEALTH_FIELDS: readonly HealthNamedField[] = [
  "hydration",
  "sleepTime",
  "sleepEfficiency",
  "protein",
  "leanMass",
];

export type MetricEntry = CompetitionEntry | HealthEntry | PerformanceEntry;

// Where a metric's scalar value is stored. availability is not a scalar and is
// never routed through here (isMetricFilled and the availability widget handle
// it directly).
export type StorageLoc =
  | { kind: "healthNamed"; field: HealthNamedField }
  | { kind: "healthCustom" }
  | { kind: "map" };

export function resolveStorage(tracked: TrackedMetric): StorageLoc {
  if (tracked.type === "health") {
    if ((NAMED_HEALTH_FIELDS as readonly string[]).includes(tracked.id)) {
      return { kind: "healthNamed", field: tracked.id as HealthNamedField };
    }
    return { kind: "healthCustom" };
  }
  return { kind: "map" };
}

export function getMetricValue(
  tracked: TrackedMetric,
  entry: MetricEntry,
): number | string | undefined {
  const loc = resolveStorage(tracked);
  switch (loc.kind) {
    case "healthNamed":
      return (entry as HealthEntry)[loc.field];
    case "healthCustom":
      return (entry as HealthEntry).customMetrics?.[tracked.id];
    case "map":
      return (entry as CompetitionEntry | PerformanceEntry).metrics?.[tracked.id];
  }
}

// One filled-definition shared by the chip resolver, the row components, and
// the health-only dashboard chips: a finite number (including 0 and negatives)
// or a non-empty trimmed string. Absent / undefined means "not logged."
export function scalarFilled(value: number | string | undefined): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim() !== "";
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/metrics/metricAccessor.test.ts`
Expected: PASS (all 3 describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/metrics/metricAccessor.ts src/metrics/metricAccessor.test.ts
git commit -m "feat(logs): add metric storage descriptor and value reader [DGT-85]"
```

---

### Task 2: Unified filled check (`availabilityFilled`, `isMetricFilled`)

Moves `availabilityFilled` into the accessor (so the unified filled check owns the one non-scalar case) and adds `isMetricFilled`.

**Files:**
- Modify: `src/metrics/metricAccessor.ts`
- Test: `src/metrics/metricAccessor.test.ts`

**Interfaces:**
- Consumes: `getMetricValue`, `scalarFilled` (Task 1).
- Produces:
  - `function availabilityFilled(entry: HealthEntry): boolean`
  - `function isMetricFilled(tracked: TrackedMetric, entry: MetricEntry): boolean`

- [ ] **Step 1: Write the failing test** (append to `src/metrics/metricAccessor.test.ts`)

```ts
import { isMetricFilled } from "./metricAccessor";

describe("isMetricFilled", () => {
  it("delegates health availability to the tree check", () => {
    const t = tracked("availability", "health");
    expect(isMetricFilled(t, health({ availability: {} }))).toBe(false);
    expect(
      isMetricFilled(
        t,
        health({ availability: { practiceHeld: false, gameHeld: false } }),
      ),
    ).toBe(true);
  });

  it("uses scalarFilled for every other metric", () => {
    expect(isMetricFilled(tracked("hydration", "health"), health({ hydration: 0 }))).toBe(true);
    expect(isMetricFilled(tracked("hydration", "health"), health())).toBe(false);
    expect(isMetricFilled(tracked("scores", "performance"), perf({ scores: 12 }))).toBe(true);
    expect(isMetricFilled(tracked("scores", "performance"), perf({ scores: "" }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/metrics/metricAccessor.test.ts`
Expected: FAIL - `isMetricFilled` is not exported.

- [ ] **Step 3: Write minimal implementation** (append to `src/metrics/metricAccessor.ts`)

```ts
// Availability counts as filled iff practiceHeld is answered AND (practiceHeld
// is false OR practiceParticipation is answered) - the tree must be answered to
// its leaves. Same rule for game. "Answered" means typeof === "boolean".
export function availabilityFilled(entry: HealthEntry): boolean {
  const a = entry.availability;
  if (!a) return false;
  const practiceFilled =
    typeof a.practiceHeld === "boolean" &&
    (a.practiceHeld === false || typeof a.practiceParticipation === "boolean");
  const gameFilled =
    typeof a.gameHeld === "boolean" &&
    (a.gameHeld === false || typeof a.gameParticipation === "boolean");
  return practiceFilled && gameFilled;
}

export function isMetricFilled(tracked: TrackedMetric, entry: MetricEntry): boolean {
  if (tracked.type === "health" && tracked.id === "availability") {
    return availabilityFilled(entry as HealthEntry);
  }
  return scalarFilled(getMetricValue(tracked, entry));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/metrics/metricAccessor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/metrics/metricAccessor.ts src/metrics/metricAccessor.test.ts
git commit -m "feat(logs): add unified isMetricFilled to the accessor [DGT-85]"
```

---

### Task 3: Write descriptor (`resolveWrite`)

**Files:**
- Modify: `src/metrics/metricAccessor.ts`
- Test: `src/metrics/metricAccessor.test.ts`

**Interfaces:**
- Produces:
  - `type WriteSlice = "health" | "performance" | "competition"`
  - `type MetricWrite = { slice: WriteSlice; partial: Partial<MetricEntry> }`
  - `function resolveWrite(tracked: TrackedMetric, value: number | string | undefined): MetricWrite`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { resolveWrite } from "./metricAccessor";

describe("resolveWrite", () => {
  it("writes a named health field", () => {
    expect(resolveWrite(tracked("hydration", "health"), 4)).toEqual({
      slice: "health",
      partial: { hydration: 4 },
    });
  });
  it("writes a health custom under customMetrics", () => {
    expect(resolveWrite(tracked("mood", "health"), 2)).toEqual({
      slice: "health",
      partial: { customMetrics: { mood: 2 } },
    });
  });
  it("writes perf/comp under the metrics map", () => {
    expect(resolveWrite(tracked("scores", "performance"), 10)).toEqual({
      slice: "performance",
      partial: { metrics: { scores: 10 } },
    });
    expect(resolveWrite(tracked("goals", "competition"), 3)).toEqual({
      slice: "competition",
      partial: { metrics: { goals: 3 } },
    });
  });
  it("preserves undefined so the delete sentinel fires downstream", () => {
    expect(resolveWrite(tracked("mood", "health"), undefined)).toEqual({
      slice: "health",
      partial: { customMetrics: { mood: undefined } },
    });
    expect(resolveWrite(tracked("scores", "performance"), undefined)).toEqual({
      slice: "performance",
      partial: { metrics: { scores: undefined } },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/metrics/metricAccessor.test.ts`
Expected: FAIL - `resolveWrite` is not exported.

- [ ] **Step 3: Write minimal implementation** (append)

```ts
export type WriteSlice = "competition" | "health" | "performance";

export interface MetricWrite {
  slice: WriteSlice;
  partial: Partial<MetricEntry>;
}

// undefined is passed through verbatim: set*Entry -> withDeleteSentinels turns
// it into a Firestore deleteField(). Do not coerce it to null or 0.
export function resolveWrite(
  tracked: TrackedMetric,
  value: number | string | undefined,
): MetricWrite {
  const loc = resolveStorage(tracked);
  switch (loc.kind) {
    case "healthNamed":
      return { slice: "health", partial: { [loc.field]: value } as Partial<HealthEntry> };
    case "healthCustom":
      return { slice: "health", partial: { customMetrics: { [tracked.id]: value } } };
    case "map":
      return {
        slice: tracked.type === "performance" ? "performance" : "competition",
        partial: { metrics: { [tracked.id]: value } },
      };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/metrics/metricAccessor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/metrics/metricAccessor.ts src/metrics/metricAccessor.test.ts
git commit -m "feat(logs): add write descriptor to the accessor [DGT-85]"
```

---

### Task 4: Refactor `isHealthFieldFilled` onto the shared core

Removes the per-id switch and the local `availabilityFilled`; reuses `scalarFilled`, `NAMED_HEALTH_FIELDS`, and `availabilityFilled` from the accessor so there is exactly one filled-definition. No behavior change - the existing `healthCompleteness.test.ts` is the guard.

**Files:**
- Modify: `src/utils/healthCompleteness.ts`
- Test (existing, must still pass): `src/utils/healthCompleteness.test.ts`

**Interfaces:**
- Consumes: `NAMED_HEALTH_FIELDS`, `availabilityFilled`, `scalarFilled`, `type HealthNamedField` (from `../metrics/metricAccessor`).
- Produces: `isHealthFieldFilled` unchanged in signature and behavior.

- [ ] **Step 1: Replace the imports and `isHealthFieldFilled`, delete local `availabilityFilled`**

Change the top import block (currently line 1) to add the accessor import, alphabetically after the relative-path rules keep `../metrics/...` before `../types/...`:

```ts
import {
  availabilityFilled,
  NAMED_HEALTH_FIELDS,
  scalarFilled,
  type HealthNamedField,
} from "../metrics/metricAccessor";
import type { HealthEntry } from "../types/data";
```

Replace the whole `isHealthFieldFilled` function (currently lines 44-72) and delete the standalone `availabilityFilled` (currently lines 74-84) with:

```ts
export function isHealthFieldFilled(entry: HealthEntry | null, id: string): boolean {
  if (!entry) return false;
  if (id === "availability") return availabilityFilled(entry);
  const value = (NAMED_HEALTH_FIELDS as readonly string[]).includes(id)
    ? entry[id as HealthNamedField]
    : entry.customMetrics?.[id];
  return scalarFilled(value);
}
```

Keep `getChipStateBy`, `getChipState`, and `ChipState` exactly as they are.

- [ ] **Step 2: Run the existing test to verify no behavior change**

Run: `npx vitest run src/utils/healthCompleteness.test.ts`
Expected: PASS (unchanged behavior).

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors (confirms the moved `availabilityFilled` has no other importers left behind).

- [ ] **Step 4: Commit**

```bash
git add src/utils/healthCompleteness.ts
git commit -m "refactor(logs): share the filled-check core with the accessor [DGT-85]"
```

---

### Task 5: `useMetricWriter` hook

**Files:**
- Create: `src/components/logs/useMetricWriter.ts`
- Test: `src/components/logs/useMetricWriter.test.ts`

**Interfaces:**
- Consumes: `useData` (from `../../contexts/DataContext`); `resolveWrite` (from `../../metrics/metricAccessor`); `TrackedMetric` (type-only).
- Produces: `function useMetricWriter(): { setMetricValue: (tracked: TrackedMetric, dateIso: string, value: number | string | undefined) => void }`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { TrackedMetric } from "./useTrackedMetrics";

const setHealthEntry = vi.fn();
const setPerformanceEntry = vi.fn();
const setCompetitionEntry = vi.fn();

vi.mock("../../contexts/DataContext", () => ({
  useData: () => ({ setHealthEntry, setPerformanceEntry, setCompetitionEntry }),
}));

import { useMetricWriter } from "./useMetricWriter";

function tracked(id: string, type: TrackedMetric["type"]): TrackedMetric {
  return { id, name: id, type, section: "daily" };
}

describe("useMetricWriter", () => {
  it("routes a named health write to setHealthEntry", () => {
    const { result } = renderHook(() => useMetricWriter());
    result.current.setMetricValue(tracked("hydration", "health"), "2026-07-20", 4);
    expect(setHealthEntry).toHaveBeenCalledWith("2026-07-20", { hydration: 4 });
  });

  it("routes a performance write to setPerformanceEntry", () => {
    const { result } = renderHook(() => useMetricWriter());
    result.current.setMetricValue(tracked("scores", "performance"), "2026-07-20", 10);
    expect(setPerformanceEntry).toHaveBeenCalledWith("2026-07-20", { metrics: { scores: 10 } });
  });

  it("passes undefined through for deletes", () => {
    const { result } = renderHook(() => useMetricWriter());
    result.current.setMetricValue(tracked("mood", "health"), "2026-07-20", undefined);
    expect(setHealthEntry).toHaveBeenCalledWith("2026-07-20", { customMetrics: { mood: undefined } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/logs/useMetricWriter.test.ts`
Expected: FAIL - cannot resolve `./useMetricWriter`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/logs/useMetricWriter.ts
import { useCallback } from "react";
import { useData } from "../../contexts/DataContext";
import { resolveWrite } from "../../metrics/metricAccessor";
import type { CompetitionEntry, HealthEntry, PerformanceEntry } from "../../types/data";
import type { TrackedMetric } from "./useTrackedMetrics";

// The write half of the metric accessor. resolveWrite (pure) decides the slice
// and partial; this hook only wires the slice to the matching DataContext
// setter. Parsing raw input to a typed value stays in the row/widget layer -
// setMetricValue takes an already-typed value, and undefined flows through to
// the delete sentinel.
export function useMetricWriter() {
  const { setHealthEntry, setPerformanceEntry, setCompetitionEntry } = useData();

  const setMetricValue = useCallback(
    (tracked: TrackedMetric, dateIso: string, value: number | string | undefined) => {
      const { slice, partial } = resolveWrite(tracked, value);
      switch (slice) {
        case "health":
          setHealthEntry(dateIso, partial as Partial<HealthEntry>);
          return;
        case "performance":
          setPerformanceEntry(dateIso, partial as Partial<PerformanceEntry>);
          return;
        case "competition":
          setCompetitionEntry(dateIso, partial as Partial<CompetitionEntry>);
          return;
      }
    },
    [setHealthEntry, setPerformanceEntry, setCompetitionEntry],
  );

  return { setMetricValue };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/logs/useMetricWriter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/logs/useMetricWriter.ts src/components/logs/useMetricWriter.test.ts
git commit -m "feat(logs): add useMetricWriter hook [DGT-85]"
```

---

### Task 6: `metricRendersRow` predicate

A rendering-capability predicate (keyed on the metric definition, not on any entry), colocated with the section counter it serves.

**Files:**
- Modify: `src/components/logs/useTrackedMetrics.ts`
- Test: `src/components/logs/useTrackedMetrics.test.ts` (append; note this file is jsdom)

**Interfaces:**
- Produces: `function metricRendersRow(tracked: TrackedMetric): boolean`

- [ ] **Step 1: Write the failing test** (append to `src/components/logs/useTrackedMetrics.test.ts`)

```ts
import { metricRendersRow } from "./useTrackedMetrics";
import type { CustomMetricDef } from "../../types/customMetrics";

function nominalCustom(type: TrackedMetric["type"]): TrackedMetric {
  const def: CustomMetricDef = {
    id: "label",
    ownerId: "u",
    name: "Label",
    metricType: type,
    primitive: "nominal",
    levels: [{ label: "A" }, { label: "B" }],
    inputType: "radio",
    referenceUrl: "",
    createdAt: 0,
    updatedAt: 0,
  };
  return { id: "label", name: "Label", type, section: "daily", customDef: def };
}

describe("metricRendersRow", () => {
  it("returns false for nominal customs of any type", () => {
    expect(metricRendersRow(nominalCustom("health"))).toBe(false);
    expect(metricRendersRow(nominalCustom("performance"))).toBe(false);
  });

  it("returns true for built-ins and scalar customs", () => {
    expect(
      metricRendersRow({ id: "hydration", name: "Hydration", type: "health", section: "daily" }),
    ).toBe(true);
    expect(
      metricRendersRow({
        id: "relativeProteinIntake",
        name: "RPI",
        type: "health",
        section: "daily",
      }),
    ).toBe(true);
  });
});
```

`TrackedMetric` is already imported at the top of this test file; if not, add `import type { TrackedMetric } from "./useTrackedMetrics";`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/logs/useTrackedMetrics.test.ts`
Expected: FAIL - `metricRendersRow` is not exported.

- [ ] **Step 3: Write minimal implementation** (add to `src/components/logs/useTrackedMetrics.ts`, after the `TrackedMetric` interface)

```ts
// Whether a tracked metric renders a row at all. Nominal customs are
// schema-reserved but have no widget in any metric type, so they render
// nothing. This is the single predicate the section counter and the row
// dispatcher both consult, so the "(N metrics)" header and the rendered rows
// cannot disagree. Keyed on the definition, never on an entry value.
export function metricRendersRow(tracked: TrackedMetric): boolean {
  return tracked.customDef?.primitive !== "nominal";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/logs/useTrackedMetrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/logs/useTrackedMetrics.ts src/components/logs/useTrackedMetrics.test.ts
git commit -m "feat(logs): add metricRendersRow predicate [DGT-85]"
```

---

### Task 7: Route the chip resolver through `isMetricFilled`

**Files:**
- Modify: `src/components/logs/MetricsDataEntryLog.tsx`
- Test (existing, must still pass): `src/components/logs/MetricsDataEntryLog.test.tsx`

**Interfaces:**
- Consumes: `isMetricFilled` (from `../../metrics/metricAccessor`); `getChipStateBy`, `type ChipState` (still from `../../utils/healthCompleteness`).

- [ ] **Step 1: Swap the import**

Replace the current health-completeness import (line 25):

```ts
import { getChipStateBy, isHealthFieldFilled, type ChipState } from "../../utils/healthCompleteness";
```

with (drop `isHealthFieldFilled`, add the accessor import alphabetically among the existing `../../` imports, before the `../../utils/...` group):

```ts
import { isMetricFilled } from "../../metrics/metricAccessor";
```
```ts
import { getChipStateBy, type ChipState } from "../../utils/healthCompleteness";
```

- [ ] **Step 2: Replace the chip resolver body**

Replace the `getChipStateBy(...)` argument block (currently lines 129-141) with:

```ts
      : getChipStateBy(
          dueMetrics.map((m) => m.id),
          (id) => {
            const m = dueById.get(id);
            if (!m) return false;
            const entry =
              m.type === "health"
                ? healthEntry
                : m.type === "performance"
                  ? performanceEntry
                  : competitionEntry;
            return isMetricFilled(m, entry);
          },
        );
```

- [ ] **Step 3: Run the existing log test + typecheck**

Run: `npx vitest run src/components/logs/MetricsDataEntryLog.test.tsx`
Expected: PASS (chip behavior unchanged).

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/logs/MetricsDataEntryLog.tsx
git commit -m "refactor(logs): route the chip resolver through isMetricFilled [DGT-85]"
```

---

### Task 8: Fix the count inflation with `metricRendersRow`

**Files:**
- Modify: `src/components/logs/MetricsDataEntryLog.tsx`
- Modify: `src/components/logs/LogMetricRow.tsx`
- Test: `src/components/logs/LogMetricRow.test.tsx` (append)

**Interfaces:**
- Consumes: `metricRendersRow` (from `./useTrackedMetrics`).

- [ ] **Step 1: Write the failing test** (append to `src/components/logs/LogMetricRow.test.tsx`)

Mirror the fixture style already in that file; build a nominal health custom and assert the dispatcher renders nothing. Adjust the render wrapper to match the file's existing helper if it differs:

```ts
import type { CustomMetricDef } from "../../types/customMetrics";

function nominalHealthTracked(): TrackedMetric {
  const def: CustomMetricDef = {
    id: "label",
    ownerId: "u",
    name: "Label",
    metricType: "health",
    primitive: "nominal",
    levels: [{ label: "A" }, { label: "B" }],
    inputType: "radio",
    referenceUrl: "",
    createdAt: 0,
    updatedAt: 0,
  };
  return { id: "label", name: "Label", type: "health", section: "daily", customDef: def };
}

it("renders nothing for a nominal custom", () => {
  const { container } = render(
    <MemoryRouter>
      <table>
        <tbody>
          <LogMetricRow
            tracked={nominalHealthTracked()}
            healthEntry={{ version: 1, date: "2026-07-20", availability: {} }}
            performanceEntry={{ version: 1, date: "2026-07-20", metrics: {} }}
            competitionEntry={{ version: 1, date: "2026-07-20", metrics: {} }}
            summary={{}}
            summaryCell=""
            competitionTerm="game"
            setHealth={() => {}}
            setPerformance={() => {}}
            setCompetition={() => {}}
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
  expect(container.querySelector("tr")).toBeNull();
});
```

If the existing tests import `render`, `MemoryRouter`, and `LogMetricRow` already, reuse those imports rather than redeclaring. `summary={{}}` relies on `HealthSummary` being an all-optional shape; if the type requires fields, copy the summary fixture the file's other tests use.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/logs/LogMetricRow.test.tsx`
Expected: FAIL - a `<tr>` is rendered (nominal currently renders `null` only inside `HealthMetricRow`, but the assertion pins the new dispatcher-level guard; confirm it fails before the guard exists by temporarily expecting the row, or accept that this test locks in the guard added in Step 3).

- [ ] **Step 3: Add the dispatcher short-circuit**

In `src/components/logs/LogMetricRow.tsx`, add the import and the guard. Add to the imports (alphabetical - `metricRendersRow` joins the existing `./useTrackedMetrics` import):

```ts
import { metricRendersRow, type TrackedMetric } from "./useTrackedMetrics";
```

Then at the top of the component body, replace:

```ts
export function LogMetricRow(props: LogMetricRowProps) {
  const { tracked } = props;

  if (tracked.type === "health") {
```

with:

```ts
export function LogMetricRow(props: LogMetricRowProps) {
  const { tracked } = props;

  // Single source of truth for "does this render a row?", shared with the
  // section counter. Nominal customs (no widget in any type) render nothing.
  if (!metricRendersRow(tracked)) return null;

  if (tracked.type === "health") {
```

- [ ] **Step 4: Filter the section count**

In `src/components/logs/MetricsDataEntryLog.tsx`, add the import (join the existing `./useTrackedMetrics` import):

```ts
import { metricRendersRow, useTrackedMetrics, type TrackedMetric } from "./useTrackedMetrics";
```

Change the count (currently `count={rows.length}` at line 190) to:

```ts
              count={rows.filter(metricRendersRow).length}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/components/logs/LogMetricRow.test.tsx src/components/logs/MetricsDataEntryLog.test.tsx`
Expected: PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/logs/LogMetricRow.tsx src/components/logs/MetricsDataEntryLog.tsx src/components/logs/LogMetricRow.test.tsx
git commit -m "fix(logs): stop nominal customs inflating the section count [DGT-85]"
```

---

### Task 9: Route perf/comp read + write through the accessor

**Files:**
- Modify: `src/components/logs/MetricsDataEntryLog.tsx`
- Modify: `src/components/logs/LogMetricRow.tsx`
- Test (existing, must still pass): `src/components/logs/MetricsDataEntryLog.test.tsx`, `src/components/logs/PerfCompMetricRow.test.tsx`

**Interfaces:**
- Consumes: `getMetricValue` (from `../../metrics/metricAccessor`); `useMetricWriter` (from `./useMetricWriter`).
- `PerfCompMetricRow`'s `setValue: (raw: string) => void` contract is unchanged (parsing stays in the caller).

- [ ] **Step 1: Read perf/comp value via `getMetricValue` in `LogMetricRow`**

In `src/components/logs/LogMetricRow.tsx`, add the import:

```ts
import { getMetricValue } from "../../metrics/metricAccessor";
```

Replace the perf/comp return (currently lines 42-52):

```ts
  const entry = tracked.type === "performance" ? props.performanceEntry : props.competitionEntry;
  const setValue = tracked.type === "performance" ? props.setPerformance : props.setCompetition;

  return (
    <PerfCompMetricRow
      tracked={tracked}
      value={entry.metrics?.[tracked.id]}
      summaryCell={props.summaryCell}
      setValue={setValue}
    />
  );
```

with:

```ts
  const entry = tracked.type === "performance" ? props.performanceEntry : props.competitionEntry;
  const setValue = tracked.type === "performance" ? props.setPerformance : props.setCompetition;

  return (
    <PerfCompMetricRow
      tracked={tracked}
      value={getMetricValue(tracked, entry)}
      summaryCell={props.summaryCell}
      setValue={setValue}
    />
  );
```

- [ ] **Step 2: Route perf/comp writes through `useMetricWriter`**

In `src/components/logs/MetricsDataEntryLog.tsx`:

Add the import (join the existing `./` imports alphabetically):

```ts
import { useMetricWriter } from "./useMetricWriter";
```

Drop `setPerformanceEntry` and `setCompetitionEntry` from the `useData()` destructure (they now flow through the writer); keep `setHealthEntry` (still used for availability):

```ts
  const {
    health,
    performance,
    competition,
    setHealthEntry,
  } = useData();
  const tracked = useTrackedMetrics();
  const { setMetricValue } = useMetricWriter();
```

Replace the two write helpers (currently lines 147-157):

```ts
  function setPerformanceValue(metricId: string, raw: string) {
    const value = parseNumericInput(raw);
    if (value === null) return;
    setPerformanceEntry(dateIso, { metrics: { [metricId]: value } });
  }

  function setCompetitionValue(metricId: string, raw: string) {
    const value = parseNumericInput(raw);
    if (value === null) return;
    setCompetitionEntry(dateIso, { metrics: { [metricId]: value } });
  }
```

with one accessor-backed helper:

```ts
  function writeParsedValue(m: TrackedMetric, raw: string) {
    const value = parseNumericInput(raw);
    if (value === null) return;
    setMetricValue(m, dateIso, value);
  }
```

Update the row bindings (currently lines 204-205):

```ts
                  setPerformance={(raw) => writeParsedValue(m, raw)}
                  setCompetition={(raw) => writeParsedValue(m, raw)}
```

- [ ] **Step 3: Run the existing tests + typecheck**

Run: `npx vitest run src/components/logs/PerfCompMetricRow.test.tsx src/components/logs/MetricsDataEntryLog.test.tsx`
Expected: PASS. (If a MetricsDataEntryLog test asserts on `setPerformanceEntry`/`setCompetitionEntry` spies, they still fire - the writer calls the same DataContext setters - so the assertions hold.)

Run: `npx tsc -b`
Expected: no errors (confirms no leftover references to the removed helpers/destructures).

- [ ] **Step 4: Commit**

```bash
git add src/components/logs/LogMetricRow.tsx src/components/logs/MetricsDataEntryLog.tsx
git commit -m "refactor(logs): route perf/comp read and write through the accessor [DGT-85]"
```

---

### Task 10: Route health read + write through the accessor

`HealthMetricRow` reads every scalar value via `getMetricValue` and writes via a typed `writeValue`. The availability tree keeps its direct `setEntry({ availability })` path (it is not a scalar); hydration's scalar value goes through the accessor.

**Files:**
- Modify: `src/components/logs/LogMetricRow.tsx`
- Modify: `src/components/logs/MetricsDataEntryLog.tsx`
- Modify: `src/components/logs/HealthMetricRow.tsx`
- Test (existing, must still pass): `src/components/logs/HealthMetricRow.test.tsx`

**Interfaces:**
- `HealthMetricRow` gains `writeValue: (value: number | string | undefined) => void`; keeps `setEntry: (partial: Partial<HealthEntry>) => void` (availability only).
- `LogMetricRowProps` gains `setHealthValue: (value: number | string | undefined) => void`.

- [ ] **Step 1: Add `writeValue` to `HealthMetricRow` and route reads/writes**

In `src/components/logs/HealthMetricRow.tsx`:

Add the import:

```ts
import { getMetricValue } from "../../metrics/metricAccessor";
```

Add `writeValue` to the props interface (keep `setEntry`):

```ts
export interface HealthMetricRowProps {
  tracked: TrackedMetric;
  entry: HealthEntry;
  summary: HealthSummary;
  competitionTerm: string;
  setEntry: (partial: Partial<HealthEntry>) => void;
  writeValue: (value: number | string | undefined) => void;
}
```

Destructure `writeValue` in the component signature (add it to the existing list).

Replace the two local write helpers (currently lines 47-57):

```ts
  function setNumericField<K extends keyof HealthEntry>(field: K, raw: string) {
    const value = parseNumericInput(raw);
    if (value === null) return;
    setEntry({ [field]: value } as Partial<HealthEntry>);
  }

  function setCustomMetric(metricId: string, raw: string) {
    const value = parseNumericInput(raw);
    if (value === null) return;
    setEntry({ customMetrics: { [metricId]: value } });
  }
```

with one accessor-backed parse helper (storage routing now lives in the accessor, so field vs customMetrics is no longer decided here):

```ts
  function writeParsed(raw: string) {
    const value = parseNumericInput(raw);
    if (value === null) return;
    writeValue(value);
  }
```

Now update each scalar branch. **Hydration** (`onChange`, currently line 71):

```ts
          onChange={(level: number) => writeValue(level)}
```

**Availability stays untouched** - it keeps `value={entry.availability}` and `onChange={... setEntry({ availability: next })}`.

**Named numeric built-ins** (currently lines 123-141): replace the `entry[fieldKey]` read and the `onChange` with the accessor read and `writeParsed`:

```ts
    if (id === "sleepTime" || id === "sleepEfficiency" || id === "protein" || id === "leanMass") {
      const live = getMetricValue(tracked, entry);
      const stringValue =
        typeof live === "number" && Number.isFinite(live) ? String(live) : "";
      return (
        <MetricInputRow
          {...summary}
          metric={builtIn}
          inputType="numeric"
          value={stringValue}
          onChange={(raw: string) => writeParsed(raw)}
          detailHref={detailHref}
        />
      );
    }
```

**Generic built-in ordinal** (currently lines 147-162): read via accessor, write via `writeValue`:

```ts
    if (builtIn.inputType === "ordinal" && builtIn.levels) {
      const live = getMetricValue(tracked, entry);
      const ordinalValue =
        typeof live === "number" && Number.isFinite(live) ? live : undefined;
      return (
        <MetricInputRow
          {...summary}
          metric={builtIn}
          inputType="ordinal"
          levels={builtIn.levels}
          value={ordinalValue}
          onChange={(next: number) => writeValue(next)}
          detailHref={detailHref}
        />
      );
    }
```

**Generic built-in numeric** (currently lines 163-175):

```ts
    const live = getMetricValue(tracked, entry);
    const stringValue =
      typeof live === "number" && Number.isFinite(live) ? String(live) : "";
    return (
      <MetricInputRow
        {...summary}
        metric={builtIn}
        inputType="numeric"
        value={stringValue}
        onChange={(raw: string) => writeParsed(raw)}
        detailHref={detailHref}
      />
    );
```

**Custom ordinal** (currently lines 181-196): read via accessor, write via `writeValue`:

```ts
  if (def.primitive === "ordinal" && def.levels) {
    const live = getMetricValue(tracked, entry);
    const ordinalValue =
      typeof live === "number" && Number.isFinite(live) ? live : undefined;
    return (
      <MetricInputRow
        {...summary}
        inputType={isYesNoLevels(def.levels) ? "radio" : "ordinal"}
        metric={adaptCustom(def)}
        levels={def.levels}
        value={ordinalValue}
        onChange={(next: number) => writeValue(next)}
        detailHref={detailHref}
      />
    );
  }
```

**Custom numeric** (currently lines 203-226): read via accessor, write via `writeParsed`:

```ts
  const live = getMetricValue(tracked, entry);
  const stringValue =
    typeof live === "number" && Number.isFinite(live)
      ? String(live)
      : typeof live === "string"
        ? live
        : "";
  return (
    <MetricInputRow
      {...summary}
      metric={adaptCustom(def)}
      inputType="numeric"
      value={stringValue}
      onChange={(raw: string) => writeParsed(raw)}
      detailHref={detailHref}
      allowNegative={(def.yBottomRaw ?? 0) < 0}
    />
  );
```

Leave the `def.primitive === "nominal"` guard (currently lines 197-201) in place as harmless dead code - `LogMetricRow` already short-circuits it in Task 8. `parseNumericInput` stays imported (used by `writeParsed`).

- [ ] **Step 2: Thread `writeValue` from `LogMetricRow`**

In `src/components/logs/LogMetricRow.tsx`, add `setHealthValue` to the props interface:

```ts
  setHealth: (partial: Partial<HealthEntry>) => void;
  setHealthValue: (value: number | string | undefined) => void;
  setPerformance: (raw: string) => void;
  setCompetition: (raw: string) => void;
```

Pass it to `HealthMetricRow` (the health branch, currently lines 31-39):

```ts
    return (
      <HealthMetricRow
        tracked={tracked}
        entry={props.healthEntry}
        summary={props.summary}
        competitionTerm={props.competitionTerm}
        setEntry={props.setHealth}
        writeValue={props.setHealthValue}
      />
    );
```

- [ ] **Step 3: Bind `setHealthValue` in `MetricsDataEntryLog`**

In `src/components/logs/MetricsDataEntryLog.tsx`, add the binding alongside the existing `setHealth` (currently line 203):

```ts
                  setHealth={(partial) => setHealthEntry(dateIso, partial)}
                  setHealthValue={(value) => setMetricValue(m, dateIso, value)}
```

- [ ] **Step 4: Run the health-row test + typecheck**

Run: `npx vitest run src/components/logs/HealthMetricRow.test.tsx`
Expected: FAIL first if the test constructs `HealthMetricRow` without the new `writeValue` prop - update that test's render helper to pass `writeValue={vi.fn()}` (and assert on it where it previously asserted on `setEntry` for scalar writes; `setEntry` assertions for availability stay). Then PASS.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Full suite + build**

Run: `npm test`
Expected: PASS (whole suite).

Run: `npm run build`
Expected: clean production build.

- [ ] **Step 6: Commit**

```bash
git add src/components/logs/HealthMetricRow.tsx src/components/logs/LogMetricRow.tsx src/components/logs/MetricsDataEntryLog.tsx src/components/logs/HealthMetricRow.test.tsx
git commit -m "refactor(logs): route health read and write through the accessor [DGT-85]"
```

---

### Task 11: Manual verification in the running app

**Files:** none (verification only).

- [ ] **Step 1: Start the app**

Run: `npm run dev` (with `npm run emulators` in a second terminal). Sign in and open `/log`.

- [ ] **Step 2: Exercise each storage path and confirm parity with pre-change behavior**

- Enter a **hydration** value (health named field via color scale) - persists and reloads.
- Enter **sleep time / protein** (health named numeric) - persists.
- Enter a value for a tracked **health custom** (numeric and, if tracked, ordinal) - persists under `customMetrics`.
- Enter a **performance** and a **competition** metric - persist under `metrics`; the competition Summary running total still updates.
- Clear a value (empty the input) and confirm it deletes (field disappears / chip drops) - the delete sentinel path.
- Toggle **availability** (the tree) - still writes and reads correctly (the non-accessor path).
- Confirm the **day chip** ("All / Some / None") reflects filled state across mixed types.
- Confirm a section's **"(N metrics)"** header counts only rendered rows.

- [ ] **Step 3: Confirm the uniform-nominal behavior (optional, needs an externally-written doc)**

Not reachable through the form. If a nominal custom is present via Firestore, confirm it renders no row and is excluded from the count. Otherwise rely on the unit tests (Tasks 6, 8).

---

## Self-Review

**Spec coverage:**
- Item 1 accessor - `resolveStorage` (Task 1), `getMetricValue`/`scalarFilled` (Task 1), `isMetricFilled`/`availabilityFilled` (Task 2), `resolveWrite` (Task 3), `useMetricWriter` (Task 5). Covered.
- Shared filled-core / no drift with dashboard consumers - Task 4. Covered.
- Chip resolver collapse - Task 7. Write-path replacement - Tasks 9-10. Row storage-agnostic reads - Tasks 9-10. Covered.
- Item 4 count fix (`metricRendersRow`, uniform nominal) - Tasks 6, 8. Covered.
- Out of scope (row merge, Summary semantics, storage migration, sparkbars) - not attempted. Correct.

**Placeholder scan:** No TBD/TODO. Every code step shows full code. The one judgment call flagged to the executor is matching existing test fixtures (`HealthSummary` shape, the `LogMetricRow` render helper) - the plan points at the sibling test to copy from rather than inventing a shape.

**Type consistency:** `setMetricValue(tracked, dateIso, value)` signature is identical across Tasks 5, 9, 10. `writeValue: (value: number | string | undefined) => void` matches between `HealthMetricRow` (Task 10) and the `setHealthValue` binding. `metricRendersRow(tracked)` identical across Tasks 6, 8. `MetricEntry` union defined once (Task 1) and reused. `resolveWrite` returns `{ slice, partial }` consumed unchanged by `useMetricWriter`.

**Note for the executor:** Tasks 7-10 all edit `MetricsDataEntryLog.tsx` and `LogMetricRow.tsx`. Do them in order; each commit leaves the suite green, so a later task builds on the previous edit rather than the original line numbers. Re-read the file before each edit - the line numbers cited are from the pre-change file and drift as tasks land.
