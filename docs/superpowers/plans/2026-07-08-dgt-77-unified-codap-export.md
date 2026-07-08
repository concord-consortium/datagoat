# DGT-77 Unified CODAP Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the `/codap` export into three per-category datasets (Health, Performance, Competition), each wide with one row per date, where every tracked metric becomes a correctly-typed CODAP attribute carrying its unit, time formatting, and categorical labels.

**Architecture:** A new pure module `src/codap/codapExport.ts` turns metric definitions + entries into CODAP attribute specs and rows (the "columns" model: each metric yields one or two columns, each column knows its `AttributeSpec` and a `toValue(raw)` function, keeping attribute names and row values in sync). `src/codap/codapApi.ts` stops inferring attribute types from sample rows and instead consumes the specs directly. `src/codap/CodapPlugin.tsx` reads health + performance + competition data plus custom-metric definitions, renders three checkboxes, and calls `sendDataset` once per selected category.

**Tech Stack:** React 19 + TypeScript + Vite, `@concord-consortium/codap-plugin-api`, Vitest (jsdom), CSS Modules.

## Global Constraints

- Verify TypeScript with build mode: `npx tsc -b` or `npm run build`. Do NOT rely on `tsc --noEmit` (CI uses `tsc -b`, which catches errors `--noEmit` misses).
- No em dashes anywhere (code, comments, UI copy). Use regular hyphens.
- Commit subjects follow Conventional Commits with the Jira key suffixed: `feat(dgt-77): ... [DGT-77]`. Multi-line messages via `git commit -F <file>`; single-line via `-m`.
- Named imports stay alphabetical.
- Vanilla CSS Modules only; reuse existing `CodapPlugin.module.css` classes for the new checkbox (no new framework, no CSS nesting).
- Tests are colocated `*.test.ts(x)`, Vitest, jsdom where DOM is touched, following the existing mock patterns in `src/codap/`.
- CODAP `Attribute` payload fields available (from the library's `.d.ts`): `name`, `type`, `unit`, `precision`, `description`. This plan sets only `name`, `type`, and `unit`.
- Attribute **names use each metric's display name** (e.g. `Total Sleep Time`), not its id. The upsert key stays the `date` attribute.

---

### Task 1: codapApi consumes attribute specs instead of inferring types

Replace `inferAttributeType` (sample-row scanning) with spec-driven attribute creation and reconciliation. Introduce the `AttributeSpec` type that later tasks produce.

**Files:**
- Modify: `src/codap/codapApi.ts`
- Test: `src/codap/codapApi.test.ts`

**Interfaces:**
- Produces: `interface AttributeSpec { name: string; type: string; unit?: string }` (exported from `codapApi.ts`); `SendDatasetArgs.attributes: AttributeSpec[]`; `DatasetRow` unchanged.

- [ ] **Step 1: Update the tests to the new `attributes` shape and drop `inferAttributeType`**

In `src/codap/codapApi.test.ts`:

1. Remove `inferAttributeType` from the import so it reads:

```ts
import {
  ensureSuccess,
  useCodapApi,
  type DatasetRow,
} from "./codapApi";
```

2. Delete the entire `describe("inferAttributeType", () => { ... })` block.

3. In the create-context test, change the `attributes` argument and the expected `attrs`:

```ts
await result.current.sendDataset({
  name: "DataGOAT-Health",
  title: "Health",
  collectionName: "Health",
  attributes: [
    { name: "date", type: "date" },
    { name: "hydration", type: "numeric", unit: "level" },
  ],
  rows: [{ date: "2026-04-01", hydration: 64 }],
});
```

Also change the matching `title:` inside the `sendRequest` payload assertion (`expect.objectContaining({ ... })`) from `"Health & Performance"` to `"Health"`, and change the expected `attrs`:

```ts
title: "Health",
```

```ts
attrs: [
  { name: "date", type: "date" },
  { name: "hydration", type: "numeric", unit: "level" },
],
```

4. In every other `sendDataset(...)` call in this file, replace the string-array `attributes` with specs:
   - `attributes: ["date", "hydration"]` becomes `attributes: [{ name: "date", type: "date" }, { name: "hydration", type: "numeric" }]`
   - `attributes: ["date"]` becomes `attributes: [{ name: "date", type: "date" }]`

5. The `"upgrades a categorical attr to numeric on a populated re-send"` test keeps its assertion unchanged (spec `hydration` type is `numeric`, existing is `categorical`, so `updateAttribute` still fires with `{ type: "numeric" }`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/codap/codapApi.test.ts`
Expected: FAIL - `inferAttributeType` no longer exported / `attributes` type mismatch / create-payload attrs differ.

- [ ] **Step 3: Rewrite `codapApi.ts` to consume specs**

In `src/codap/codapApi.ts`:

1. Replace the `DatasetRow` interface block's neighbor by adding the `AttributeSpec` type just above `SendDatasetArgs`:

```ts
export interface AttributeSpec {
  // Attribute name CODAP shows as the column header.
  name: string;
  // CODAP attribute type: "date" | "numeric" | "categorical".
  type: string;
  // Optional unit CODAP renders on numeric axes. Omitted when empty.
  unit?: string;
}
```

2. Change `SendDatasetArgs.attributes` from `string[]` to `AttributeSpec[]`.

3. Delete the entire `inferAttributeType` function and its doc comment.

4. In `sendDataset`, replace the create-context `attrs` mapping:

```ts
attrs: attributes.map((a) => ({
  name: a.name,
  type: a.type,
  ...(a.unit ? { unit: a.unit } : {}),
})),
```

5. Replace the reconciliation branch `} else if (rows.length > 0) {` and its body with a spec-driven version (no sample inference, runs whenever the context already exists):

```ts
} else {
  // Context already exists. Reconcile attribute types from the known
  // specs (no sample-row inference needed). Types are authoritative
  // from the metric registry, so an older context created with a
  // wrong type gets corrected here.
  const existingValues = (
    existing as { values?: ExistingDataContextShape }
  ).values;
  const existingCollection = existingValues?.collections?.find(
    (c) => c.name === collectionName,
  );
  if (existingCollection?.attrs) {
    for (const spec of attributes) {
      const current = existingCollection.attrs.find(
        (a) => a.name === spec.name,
      );
      if (current && current.type !== spec.type) {
        ensureSuccess(
          await updateAttribute(
            name,
            collectionName,
            spec.name,
            { name: spec.name },
            { type: spec.type, ...(spec.unit ? { unit: spec.unit } : {}) },
          ),
          "updateAttribute",
        );
      }
    }
  }
}
```

6. Update the `sendDataset` doc comment on `UseCodapApiResult` if it references inference (change "the attribute schema is set up" wording only if needed; no behavior claims about inference should remain).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/codap/codapApi.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no errors. (`inferAttributeType` had no importers outside this file.)

- [ ] **Step 6: Commit**

```bash
git add src/codap/codapApi.ts src/codap/codapApi.test.ts
git commit -m "refactor(dgt-77): drive CODAP attributes from specs, drop type inference [DGT-77]"
```

---

### Task 2: codapExport - numeric and time columns

Create the export module with the flavor normalizer and the numeric + time column builders.

**Files:**
- Create: `src/codap/codapExport.ts`
- Test: `src/codap/codapExport.test.ts`

**Interfaces:**
- Consumes: `AttributeSpec` from `./codapApi`; `MetricDefinition` from `../metrics/types`; `CustomMetricDef`, `CustomMetricLevel` from `../types/customMetrics`; `formatDecimalToTime`, `layoutUnits`, `resolveTimeLayout`, `TimeLayout`, `TimeUnit` from `../utils/timeValue`.
- Produces:
  - `type RawValue = string | number | null`
  - `type MetricFlavor = "numeric" | "time" | "ordinal" | "nominal" | "compound"`
  - `interface NormalizedMetric { id: string; name: string; unit?: string; flavor: MetricFlavor; levels?: CustomMetricLevel[]; timeLayout?: TimeLayout }`
  - `interface ExportColumn { spec: AttributeSpec; toValue: (raw: RawValue) => string | number | null }`
  - `function clockPattern(layout: TimeLayout): string`
  - `function normalizeMetric(def: MetricDefinition | CustomMetricDef): NormalizedMetric`
  - `function metricColumns(metric: NormalizedMetric): ExportColumn[]`

- [ ] **Step 1: Write the failing tests**

Create `src/codap/codapExport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MetricDefinition } from "../metrics/types";
import type { CustomMetricDef } from "../types/customMetrics";
import {
  clockPattern,
  metricColumns,
  normalizeMetric,
  type NormalizedMetric,
} from "./codapExport";
import { resolveTimeLayout } from "../utils/timeValue";

function health(partial: Partial<MetricDefinition>): MetricDefinition {
  return {
    id: "x",
    name: "X",
    unit: "",
    type: "health",
    whoCollects: "",
    howCollected: "",
    description: "",
    inputType: "numeric",
    ...partial,
  };
}

describe("clockPattern", () => {
  it("builds h:mm, m:ss, h:mm:ss, and seconds-only patterns", () => {
    expect(clockPattern(resolveTimeLayout({ unit: "hr", timePrecision: "m" })!)).toBe("h:mm");
    expect(clockPattern(resolveTimeLayout({ unit: "min", timePrecision: "s" })!)).toBe("m:ss");
    expect(clockPattern(resolveTimeLayout({ unit: "hr", timePrecision: "s" })!)).toBe("h:mm:ss");
    expect(clockPattern(resolveTimeLayout({ unit: "sec", timePrecision: "s" })!)).toBe("s");
  });
});

describe("normalizeMetric", () => {
  it("marks a plain numeric metric with its display unit", () => {
    const n = normalizeMetric(health({ id: "protein", name: "Protein Intake", unit: "g/kg/day", displayUnit: "g" }));
    expect(n).toMatchObject({ id: "protein", name: "Protein Intake", flavor: "numeric", unit: "g" });
  });

  it("marks a time metric and resolves its layout + coarse unit", () => {
    const n = normalizeMetric(health({ id: "sleepTime", name: "Total Sleep Time", unit: "hr/night", displayUnit: "hr", timePrecision: "m" }));
    expect(n.flavor).toBe("time");
    expect(n.unit).toBe("hr");
    expect(n.timeLayout).toEqual({ coarsest: "h", precision: "m" });
  });

  it("marks a custom numeric metric with its unit", () => {
    const def: CustomMetricDef = {
      id: "c1", ownerId: "u", name: "Vertical Jump", metricType: "performance",
      primitive: "numeric", unit: "in", inputType: "numeric", referenceUrl: "",
      createdAt: 0, updatedAt: 0,
    };
    expect(normalizeMetric(def)).toMatchObject({ flavor: "numeric", unit: "in", name: "Vertical Jump" });
  });
});

describe("metricColumns - numeric and time", () => {
  it("numeric produces one numeric column that passes numbers through and nulls non-numbers", () => {
    const cols = metricColumns({ id: "protein", name: "Protein Intake", flavor: "numeric", unit: "g" });
    expect(cols).toHaveLength(1);
    expect(cols[0].spec).toEqual({ name: "Protein Intake", type: "numeric", unit: "g" });
    expect(cols[0].toValue(42)).toBe(42);
    expect(cols[0].toValue(null)).toBeNull();
    expect(cols[0].toValue("skipped")).toBeNull();
  });

  it("time produces a numeric column plus a clock-string companion", () => {
    const metric: NormalizedMetric = {
      id: "sleepTime", name: "Total Sleep Time", flavor: "time", unit: "hr",
      timeLayout: { coarsest: "h", precision: "m" },
    };
    const cols = metricColumns(metric);
    expect(cols.map((c) => c.spec)).toEqual([
      { name: "Total Sleep Time", type: "numeric", unit: "hr" },
      { name: "Total Sleep Time (h:mm)", type: "categorical" },
    ]);
    expect(cols[0].toValue(7)).toBe(7);
    expect(cols[1].toValue(7)).toBe("7:00");
    expect(cols[1].toValue(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/codap/codapExport.test.ts`
Expected: FAIL - module `./codapExport` not found.

- [ ] **Step 3: Create `src/codap/codapExport.ts` with numeric + time support**

```ts
import type { MetricDefinition } from "../metrics/types";
import type { CustomMetricDef, CustomMetricLevel } from "../types/customMetrics";
import type { AttributeSpec, DatasetRow } from "./codapApi";
import {
  formatDecimalToTime,
  layoutUnits,
  resolveTimeLayout,
  type TimeLayout,
  type TimeUnit,
} from "../utils/timeValue";

// A stored metric value read off an entry: a number, a string, or
// null/absent when the metric was not logged that day.
export type RawValue = string | number | null;

export type MetricFlavor =
  | "numeric"
  | "time"
  | "ordinal"
  | "nominal"
  | "compound";

// A metric flattened to just what the CODAP export needs, with its
// flavor resolved so metricColumns() can pick the right column shape.
export interface NormalizedMetric {
  id: string;
  name: string;
  unit?: string;
  flavor: MetricFlavor;
  levels?: CustomMetricLevel[];
  timeLayout?: TimeLayout;
}

// One CODAP attribute (column): its spec plus how to turn a raw stored
// value into that column's cell. Bundling them keeps the attribute name
// and the row key in lockstep.
export interface ExportColumn {
  spec: AttributeSpec;
  toValue: (raw: RawValue) => string | number | null;
}

const COARSE_UNIT_LABEL: Record<TimeUnit, string> = {
  h: "hr",
  m: "min",
  s: "sec",
};

// The clock format label for a time layout, coarsest -> finest: the
// coarsest unit is a single letter, finer units are doubled. So [h,m]
// -> "h:mm", [m,s] -> "m:ss", [h,m,s] -> "h:mm:ss", [s] -> "s".
export function clockPattern(layout: TimeLayout): string {
  return layoutUnits(layout)
    .map((u, i) => (i === 0 ? u : `${u}${u}`))
    .join(":");
}

export function normalizeMetric(
  def: MetricDefinition | CustomMetricDef,
): NormalizedMetric {
  const isCustom = "primitive" in def;
  const id = def.id;
  const name = def.name;
  const displayUnit = isCustom ? undefined : def.displayUnit;
  const unit = displayUnit ?? def.unit;

  const layout = resolveTimeLayout({
    unit: def.unit,
    displayUnit,
    timePrecision: def.timePrecision,
  });
  if (layout) {
    return {
      id,
      name,
      unit: COARSE_UNIT_LABEL[layout.coarsest],
      flavor: "time",
      timeLayout: layout,
    };
  }

  if (isCustom) {
    if (def.primitive === "ordinal")
      return { id, name, flavor: "ordinal", levels: def.levels };
    if (def.primitive === "nominal")
      return { id, name, flavor: "nominal", levels: def.levels };
    return { id, name, unit: def.unit, flavor: "numeric" };
  }

  if (def.inputType === "ordinal")
    return { id, name, flavor: "ordinal", levels: def.levels };
  if (def.inputType === "tree") return { id, name, flavor: "compound" };
  return { id, name, unit, flavor: "numeric" };
}

function numericColumn(name: string, unit?: string): ExportColumn {
  return {
    spec: { name, type: "numeric", ...(unit ? { unit } : {}) },
    toValue: (raw) => (typeof raw === "number" ? raw : null),
  };
}

export function metricColumns(metric: NormalizedMetric): ExportColumn[] {
  switch (metric.flavor) {
    case "numeric":
      return [numericColumn(metric.name, metric.unit)];
    case "time": {
      const layout = metric.timeLayout as TimeLayout;
      return [
        numericColumn(metric.name, metric.unit),
        {
          spec: {
            name: `${metric.name} (${clockPattern(layout)})`,
            type: "categorical",
          },
          toValue: (raw) =>
            typeof raw === "number" ? formatDecimalToTime(raw, layout) : null,
        },
      ];
    }
    // ordinal / nominal / compound added in Task 3.
    default:
      return [];
  }
}
```

Note: `DatasetRow` is imported now (used by `buildDataset` in Task 4); if the linter/tsc flags it as unused before Task 4, keep it - Task 4 consumes it. If `tsc -b` errors on the unused import at this checkpoint, temporarily drop `DatasetRow` from the import and re-add it in Task 4. (Vite/tsc in this repo does not error on unused type-only imports by default; verify in Step 5.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/codap/codapExport.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/codap/codapExport.ts src/codap/codapExport.test.ts
git commit -m "feat(dgt-77): add codapExport numeric + time columns [DGT-77]"
```

---

### Task 3: codapExport - ordinal, nominal, and compound columns

Add label mapping and the remaining three flavors.

**Files:**
- Modify: `src/codap/codapExport.ts`
- Test: `src/codap/codapExport.test.ts`

**Interfaces:**
- Consumes: `NormalizedMetric`, `metricColumns` from Task 2.
- Produces: extended `metricColumns` covering `ordinal` (label + numeric level companion), `nominal` (label only), `compound` (string passthrough).

- [ ] **Step 1: Write the failing tests**

Append to `src/codap/codapExport.test.ts`:

```ts
describe("metricColumns - ordinal, nominal, compound", () => {
  it("ordinal produces a label column (mapped from levels) plus a numeric level companion", () => {
    const cols = metricColumns({
      id: "winningPercentage",
      name: "Winning Percentage",
      flavor: "ordinal",
      levels: [
        { label: "Loss", value: 0 },
        { label: "Win", value: 1 },
      ],
    });
    expect(cols.map((c) => c.spec)).toEqual([
      { name: "Winning Percentage", type: "categorical" },
      { name: "Winning Percentage (level)", type: "numeric" },
    ]);
    expect(cols[0].toValue(1)).toBe("Win");
    expect(cols[0].toValue(0)).toBe("Loss");
    expect(cols[0].toValue(null)).toBeNull();
    expect(cols[1].toValue(1)).toBe(1);
    expect(cols[1].toValue(null)).toBeNull();
  });

  it("ordinal falls back to a stringified value when no level matches", () => {
    const cols = metricColumns({
      id: "mood", name: "Mood", flavor: "ordinal",
      levels: [{ label: "1", value: 1 }],
    });
    expect(cols[0].toValue(3)).toBe("3");
  });

  it("nominal produces a single categorical label column", () => {
    const cols = metricColumns({
      id: "surface", name: "Surface", flavor: "nominal",
      levels: [{ label: "Turf" }, { label: "Grass" }],
    });
    expect(cols).toHaveLength(1);
    expect(cols[0].spec).toEqual({ name: "Surface", type: "categorical" });
    expect(cols[0].toValue("Turf")).toBe("Turf");
    expect(cols[0].toValue(null)).toBeNull();
  });

  it("compound produces a single categorical column that passes strings through", () => {
    const cols = metricColumns({ id: "availability", name: "Availability", flavor: "compound" });
    expect(cols).toHaveLength(1);
    expect(cols[0].spec).toEqual({ name: "Availability", type: "categorical" });
    expect(cols[0].toValue("practice:played / no-game")).toBe("practice:played / no-game");
    expect(cols[0].toValue(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/codap/codapExport.test.ts`
Expected: FAIL - ordinal/nominal/compound return `[]` (from the Task 2 `default`).

- [ ] **Step 3: Add `labelFor` and the three flavor cases**

In `src/codap/codapExport.ts`, add the helper above `metricColumns`:

```ts
// Map a stored value to its level label. Falls back to the raw string
// (nominal customs store the label directly) or a stringified number
// when no level matches.
function labelFor(
  levels: CustomMetricLevel[] | undefined,
  raw: RawValue,
): string | null {
  if (raw == null) return null;
  const hit = levels?.find((l) => l.value === raw);
  if (hit) return hit.label;
  return typeof raw === "string" ? raw : String(raw);
}
```

Replace the `// ordinal / nominal / compound added in Task 3.` `default: return [];` tail of the `switch` with:

```ts
    case "ordinal":
      return [
        {
          spec: { name: metric.name, type: "categorical" },
          toValue: (raw) => labelFor(metric.levels, raw),
        },
        {
          spec: { name: `${metric.name} (level)`, type: "numeric" },
          toValue: (raw) => (typeof raw === "number" ? raw : null),
        },
      ];
    case "nominal":
      return [
        {
          spec: { name: metric.name, type: "categorical" },
          toValue: (raw) => labelFor(metric.levels, raw),
        },
      ];
    case "compound":
      return [
        {
          spec: { name: metric.name, type: "categorical" },
          toValue: (raw) =>
            typeof raw === "string" ? raw : raw == null ? null : String(raw),
        },
      ];
  }
}
```

(The `switch` now covers all `MetricFlavor` members, so the `default` branch is gone. TypeScript's exhaustiveness will confirm at Step 5.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/codap/codapExport.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/codap/codapExport.ts src/codap/codapExport.test.ts
git commit -m "feat(dgt-77): add ordinal/nominal/compound columns with label mapping [DGT-77]"
```

---

### Task 4: codapExport - buildDataset and resolveTrackedMetrics

Assemble the `date` column plus each metric's columns into `{ attributes, rows }`, and resolve a category's tracked ids into normalized metrics.

**Files:**
- Modify: `src/codap/codapExport.ts`
- Test: `src/codap/codapExport.test.ts`

**Interfaces:**
- Produces:
  - `function resolveTrackedMetrics(trackedIds: string[], builtins: MetricDefinition[], customs: CustomMetricDef[]): NormalizedMetric[]`
  - `function buildDataset<T extends { date: string }>(metrics: NormalizedMetric[], entries: T[], readRaw: (entry: T, metricId: string) => RawValue): { attributes: AttributeSpec[]; rows: DatasetRow[] }`

- [ ] **Step 1: Write the failing tests**

Append to `src/codap/codapExport.test.ts`:

```ts
import { buildDataset, resolveTrackedMetrics } from "./codapExport";

describe("resolveTrackedMetrics", () => {
  const builtins: MetricDefinition[] = [health({ id: "hydration", name: "Hydration", unit: "level" })];
  const customs: CustomMetricDef[] = [{
    id: "c1", ownerId: "u", name: "Vertical Jump", metricType: "performance",
    primitive: "numeric", unit: "in", inputType: "numeric", referenceUrl: "",
    createdAt: 0, updatedAt: 0,
  }];

  it("resolves builtins and customs by id, in tracked order, skipping unknown ids", () => {
    const out = resolveTrackedMetrics(["hydration", "c1", "ghost"], builtins, customs);
    expect(out.map((m) => m.name)).toEqual(["Hydration", "Vertical Jump"]);
    expect(out.map((m) => m.flavor)).toEqual(["numeric", "numeric"]);
  });
});

describe("buildDataset", () => {
  it("prepends a date attribute and emits one row per entry with name-keyed cells", () => {
    const metrics: NormalizedMetric[] = [
      { id: "hydration", name: "Hydration", flavor: "numeric", unit: "level" },
      { id: "sleepTime", name: "Total Sleep Time", flavor: "time", unit: "hr", timeLayout: { coarsest: "h", precision: "m" } },
    ];
    const entries = [{ date: "2026-04-01", vals: { hydration: 64, sleepTime: 7 } }];
    const readRaw = (e: (typeof entries)[number], id: string) =>
      (e.vals as Record<string, number>)[id] ?? null;

    const { attributes, rows } = buildDataset(metrics, entries, readRaw);
    expect(attributes).toEqual([
      { name: "date", type: "date" },
      { name: "Hydration", type: "numeric", unit: "level" },
      { name: "Total Sleep Time", type: "numeric", unit: "hr" },
      { name: "Total Sleep Time (h:mm)", type: "categorical" },
    ]);
    expect(rows).toEqual([
      {
        date: "2026-04-01",
        Hydration: 64,
        "Total Sleep Time": 7,
        "Total Sleep Time (h:mm)": "7:00",
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/codap/codapExport.test.ts`
Expected: FAIL - `buildDataset` / `resolveTrackedMetrics` not exported.

- [ ] **Step 3: Implement both functions**

Append to `src/codap/codapExport.ts`:

```ts
// Resolve a category's tracked metric ids to normalized metrics, in the
// order the ids appear. Builtins win ties with customs (ids are unique
// across the two in practice). Unknown ids (stale profile entries) are
// skipped so the export never invents a column with no definition.
export function resolveTrackedMetrics(
  trackedIds: string[],
  builtins: MetricDefinition[],
  customs: CustomMetricDef[],
): NormalizedMetric[] {
  const byId = new Map<string, MetricDefinition | CustomMetricDef>();
  for (const c of customs) byId.set(c.id, c);
  for (const b of builtins) byId.set(b.id, b);
  const out: NormalizedMetric[] = [];
  for (const id of trackedIds) {
    const def = byId.get(id);
    if (def) out.push(normalizeMetric(def));
  }
  return out;
}

// Build a wide, date-keyed dataset: a leading `date` attribute plus each
// metric's one or two columns, and one row per entry. `readRaw` pulls a
// metric's stored value off an entry (health reads typed fields + the
// customMetrics bag; competition/performance read the metrics bag).
export function buildDataset<T extends { date: string }>(
  metrics: NormalizedMetric[],
  entries: T[],
  readRaw: (entry: T, metricId: string) => RawValue,
): { attributes: AttributeSpec[]; rows: DatasetRow[] } {
  const columns = metrics.flatMap((m) =>
    metricColumns(m).map((c) => ({ ...c, metricId: m.id })),
  );
  const attributes: AttributeSpec[] = [
    { name: "date", type: "date" },
    ...columns.map((c) => c.spec),
  ];
  const rows = entries.map((e) => {
    const row: DatasetRow = { date: e.date };
    for (const c of columns) {
      row[c.spec.name] = c.toValue(readRaw(e, c.metricId));
    }
    return row;
  });
  return { attributes, rows };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/codap/codapExport.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/codap/codapExport.ts src/codap/codapExport.test.ts
git commit -m "feat(dgt-77): add buildDataset + resolveTrackedMetrics [DGT-77]"
```

---

### Task 5: CodapPlugin exports three datasets with typed attributes

Wire the plugin to read performance data and custom metrics, render a third (Performance) checkbox, and send each selected category through `buildDataset`.

**Files:**
- Modify: `src/codap/CodapPlugin.tsx`
- Test: `src/codap/CodapPlugin.test.tsx`

**Interfaces:**
- Consumes: `buildDataset`, `resolveTrackedMetrics`, `RawValue` from `./codapExport`; `usePerformanceData` from `../contexts/DataContext`; `useCustomMetrics` from `../contexts/CustomMetricsContext`; `PERFORMANCE_METRICS` from `../metrics/performanceMetrics`.

- [ ] **Step 1: Update the plugin tests**

In `src/codap/CodapPlugin.test.tsx`:

1. Add a performance slot to `dataState` and a custom-metrics mock. Change the `dataState` type + object:

```ts
const dataState: {
  health: DataLoadState<HealthEntry>;
  competition: DataLoadState<CompetitionEntry>;
  performance: DataLoadState<PerformanceEntry>;
} = {
  health: { status: "loading" },
  competition: { status: "loading" },
  performance: { status: "loading" },
};
```

2. Add `PerformanceEntry` to the data-types import and a custom-metrics container + mocks:

```ts
import type {
  CompetitionEntry,
  HealthEntry,
  PerformanceEntry,
} from "../types/data";
import type { CustomMetricDef } from "../types/customMetrics";
```

```ts
const customState: { metrics: CustomMetricDef[] } = { metrics: [] };

vi.mock("../contexts/CustomMetricsContext", () => ({
  useCustomMetrics: () => ({ metrics: customState.metrics }),
}));
```

3. Extend the DataContext mock:

```ts
vi.mock("../contexts/DataContext", () => ({
  useHealthData: () => dataState.health,
  useCompetitionData: () => dataState.competition,
  usePerformanceData: () => dataState.performance,
}));
```

4. In `beforeEach`, reset the new state:

```ts
dataState.performance = { status: "loading" };
customState.metrics = [];
```

5. Replace the big `"...forwards selected datasets to sendDataset"` test body's data + assertions. Use registry metrics and a custom performance metric, and expect three name-keyed datasets:

```ts
    userState.loadState = {
      status: "loaded",
      profile: {
        version: 1,
        fullName: "Athlete",
        email: "athlete@school.edu",
        nickname: "Athlete",
        age: 16,
        heightFt: 5,
        heightIn: 10,
        weight: 150,
        gender: "unspecified",
        athleteType: "endurance",
        competitionTerm: "season",
        trackedHealthMetrics: ["hydration", "sleepTime"],
        trackedPerformanceMetrics: ["vjump"],
        trackedCompetitionMetrics: ["winningPercentage", "times"],
        profileComplete: true,
        trackingSetupComplete: true,
      },
    };
    customState.metrics = [
      {
        id: "vjump", ownerId: "u", name: "Vertical Jump",
        metricType: "performance", primitive: "numeric", unit: "in",
        inputType: "numeric", referenceUrl: "", createdAt: 0, updatedAt: 0,
      },
    ];
    dataState.health = {
      status: "loaded",
      entries: [{
        version: 1, date: "2026-04-01", hydration: 64, sleepTime: 7,
        availability: {},
      } as HealthEntry],
    };
    dataState.performance = {
      status: "loaded",
      entries: [{ version: 1, date: "2026-04-01", metrics: { vjump: 24 } }],
    };
    dataState.competition = {
      status: "loaded",
      entries: [{
        version: 1, date: "2026-04-01",
        metrics: { winningPercentage: 1, times: 1.5 },
      }],
    };

    const user = userEvent.setup();
    render(<CodapPlugin />);

    const sendBtn = screen.getByRole("button", { name: /send to codap/i });
    expect(sendBtn).toBeEnabled();

    const [healthBox, performanceBox, competitionBox] =
      screen.getAllByRole("checkbox");
    await user.click(healthBox);
    await user.click(performanceBox);
    await user.click(competitionBox);
    expect(sendBtn).toBeDisabled();

    await user.click(healthBox);
    await user.click(performanceBox);
    await user.click(competitionBox);
    expect(sendBtn).toBeEnabled();

    await user.click(sendBtn);

    expect(sendDatasetMock).toHaveBeenCalledTimes(3);
    expect(sendDatasetMock).toHaveBeenNthCalledWith(1, {
      name: "DataGOAT-Health",
      title: "Health",
      collectionName: "Health",
      tableName: "Health",
      attributes: [
        { name: "date", type: "date" },
        { name: "Hydration", type: "numeric", unit: "level" },
        { name: "Total Sleep Time", type: "numeric", unit: "hr" },
        { name: "Total Sleep Time (h:mm)", type: "categorical" },
      ],
      rows: [{
        date: "2026-04-01",
        Hydration: 64,
        "Total Sleep Time": 7,
        "Total Sleep Time (h:mm)": "7:00",
      }],
    });
    expect(sendDatasetMock).toHaveBeenNthCalledWith(2, {
      name: "DataGOAT-Performance",
      title: "Performance",
      collectionName: "Performance",
      tableName: "Performance",
      attributes: [
        { name: "date", type: "date" },
        { name: "Vertical Jump", type: "numeric", unit: "in" },
      ],
      rows: [{ date: "2026-04-01", "Vertical Jump": 24 }],
    });
    expect(sendDatasetMock).toHaveBeenNthCalledWith(3, {
      name: "DataGOAT-Competition",
      title: "Competition",
      collectionName: "Competition",
      tableName: "Competition",
      attributes: [
        { name: "date", type: "date" },
        { name: "Winning Percentage", type: "categorical" },
        { name: "Winning Percentage (level)", type: "numeric" },
        { name: "Times", type: "numeric", unit: "min" },
        { name: "Times (m:ss)", type: "categorical" },
      ],
      rows: [{
        date: "2026-04-01",
        "Winning Percentage": "Win",
        "Winning Percentage (level)": 1,
        Times: 1.5,
        "Times (m:ss)": "1:30",
      }],
    });
```

6. In the `makeCompleteProfile` helper (used by other tests), no change is required, but note those tests now render three checkboxes; any that call `getAllByRole("checkbox")` and destructure two entries still work (extra entries ignored).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/codap/CodapPlugin.test.tsx`
Expected: FAIL - only two checkboxes, `title: "Health & Performance"`, id-keyed attributes, `sendDataset` called twice.

- [ ] **Step 3: Rewire `CodapPlugin.tsx`**

1. Update imports (alphabetical within each group):

```ts
import {
  useCompetitionData,
  useHealthData,
  usePerformanceData,
} from "../contexts/DataContext";
import { useCustomMetrics } from "../contexts/CustomMetricsContext";
import { COMPETITION_METRICS } from "../metrics/competitionMetrics";
import { HEALTH_METRICS } from "../metrics/healthMetrics";
import { PERFORMANCE_METRICS } from "../metrics/performanceMetrics";
import type { CompetitionEntry, HealthEntry, PerformanceEntry } from "../types/data";
import { logError } from "../utils/logError";
import { useCodapApi } from "./codapApi";
import {
  buildDataset,
  resolveTrackedMetrics,
  type RawValue,
} from "./codapExport";
```

(Remove the now-unused `type DatasetRow` import from `./codapApi` and the old `import { CompetitionEntry, HealthEntry }` line if duplicated.)

2. In `CodapPluginAuthed`, read performance + customs:

```ts
  const { status, error, sendDataset } = useCodapApi();
  const { loadState, retry } = useUser();
  const health = useHealthData();
  const performance = usePerformanceData();
  const competition = useCompetitionData();
  const { metrics: customMetrics } = useCustomMetrics();
```

3. Change `selected` state to three flags:

```ts
  const [selected, setSelected] = useState<{
    health: boolean;
    performance: boolean;
    competition: boolean;
  }>({
    health: true,
    performance: true,
    competition: true,
  });
```

4. Add the performance entries + tracked list next to the existing ones:

```ts
  const healthEntries = health.status === "loaded" ? health.entries : [];
  const performanceEntries =
    performance.status === "loaded" ? performance.entries : [];
  const competitionEntries =
    competition.status === "loaded" ? competition.entries : [];

  const trackedHealth =
    profile?.trackedHealthMetrics ?? HEALTH_METRICS.map((m) => m.id);
  const trackedPerformance =
    profile?.trackedPerformanceMetrics ?? PERFORMANCE_METRICS.map((m) => m.id);
  const trackedCompetition =
    profile?.trackedCompetitionMetrics ??
    COMPETITION_METRICS.map((m) => m.id);
```

5. Replace `handleSend`'s body's two send blocks with three `buildDataset`-driven blocks:

```ts
      if (selected.health) {
        const metrics = resolveTrackedMetrics(
          trackedHealth,
          HEALTH_METRICS,
          customMetrics.filter((m) => m.metricType === "health"),
        );
        const { attributes, rows } = buildDataset(
          metrics,
          healthEntries,
          readHealthField,
        );
        await sendDataset({
          name: "DataGOAT-Health",
          title: "Health",
          collectionName: "Health",
          tableName: "Health",
          attributes,
          rows,
        });
      }
      if (selected.performance) {
        const metrics = resolveTrackedMetrics(
          trackedPerformance,
          PERFORMANCE_METRICS,
          customMetrics.filter((m) => m.metricType === "performance"),
        );
        const { attributes, rows } = buildDataset(
          metrics,
          performanceEntries,
          readBagField,
        );
        await sendDataset({
          name: "DataGOAT-Performance",
          title: "Performance",
          collectionName: "Performance",
          tableName: "Performance",
          attributes,
          rows,
        });
      }
      if (selected.competition) {
        const metrics = resolveTrackedMetrics(
          trackedCompetition,
          COMPETITION_METRICS,
          customMetrics.filter((m) => m.metricType === "competition"),
        );
        const { attributes, rows } = buildDataset(
          metrics,
          competitionEntries,
          readBagField,
        );
        await sendDataset({
          name: "DataGOAT-Competition",
          title: "Competition",
          collectionName: "Competition",
          tableName: "Competition",
          attributes,
          rows,
        });
      }
```

6. Update `dataLoading` and `canSend` to include performance:

```ts
  const dataLoading =
    loadState.status === "loading" ||
    (selected.health && health.status === "loading") ||
    (selected.performance && performance.status === "loading") ||
    (selected.competition && competition.status === "loading");

  const canSend =
    status === "connected" &&
    !dataLoading &&
    !sending &&
    (selected.health || selected.performance || selected.competition);
```

7. Replace the two-checkbox `<fieldset>` with three (Health / Performance / Competition):

```tsx
      <fieldset className={css.fieldset}>
        <legend className={css.legend}>Datasets</legend>
        <label className={css.checkRow}>
          <input
            type="checkbox"
            checked={selected.health}
            onChange={(e) =>
              setSelected((s) => ({ ...s, health: e.target.checked }))
            }
          />
          <span>
            Health ({healthEntries.length}{" "}
            {healthEntries.length === 1 ? "entry" : "entries"})
          </span>
        </label>
        <label className={css.checkRow}>
          <input
            type="checkbox"
            checked={selected.performance}
            onChange={(e) =>
              setSelected((s) => ({ ...s, performance: e.target.checked }))
            }
          />
          <span>
            Performance ({performanceEntries.length}{" "}
            {performanceEntries.length === 1 ? "entry" : "entries"})
          </span>
        </label>
        <label className={css.checkRow}>
          <input
            type="checkbox"
            checked={selected.competition}
            onChange={(e) =>
              setSelected((s) => ({ ...s, competition: e.target.checked }))
            }
          />
          <span>
            Competition ({competitionEntries.length}{" "}
            {competitionEntries.length === 1 ? "entry" : "entries"})
          </span>
        </label>
      </fieldset>
```

8. Delete `healthEntryToRow` and `competitionEntryToRow`. Keep `readHealthField` unchanged (it is now the health `readRaw`). Add `readBagField` next to it:

```ts
// Reads a metric value from a competition/performance entry's metrics
// bag, coercing absent/undefined to null so buildDataset emits an empty
// cell rather than a stray value.
function readBagField(
  e: { metrics?: Record<string, number | string | undefined> },
  id: string,
): RawValue {
  const v = e.metrics?.[id];
  return typeof v === "number" || typeof v === "string" ? v : null;
}
```

9. `readHealthField`'s return type is already `string | number | null`, structurally identical to `RawValue`; no signature change needed. If `PerformanceEntry` ends up unused as a type import, drop it from the import line.

- [ ] **Step 4: Run the plugin tests to verify they pass**

Run: `npx vitest run src/codap/CodapPlugin.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/codap/CodapPlugin.tsx src/codap/CodapPlugin.test.tsx
git commit -m "feat(dgt-77): export Health/Performance/Competition as typed CODAP datasets [DGT-77]"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all tests pass (codapExport, codapApi, CodapPlugin, and unrelated suites green).

- [ ] **Step 2: Production typecheck + build**

Run: `npm run build`
Expected: `tsc -b` clean, Vite build succeeds.

- [ ] **Step 3: Manual dev smoke (emulators)**

Run in two terminals: `npm run emulators` then `npm run dev`. As a verified user with some health/performance/competition entries (including a time metric like Total Sleep Time and an ordinal like Winning Percentage), open the CODAP plugin flow and click "Send to CODAP" with all three datasets checked. Confirm in CODAP:
- Three tables appear: Health, Performance, Competition.
- Numeric attributes (e.g. Protein Intake) carry their unit and plot on an axis.
- A time metric shows both a numeric column and a `(h:mm)` / `(m:ss)` companion.
- An ordinal metric shows the label (e.g. `Win`/`Loss`) plus a `(level)` numeric column.
- Re-clicking "Send to CODAP" updates rows in place (no duplicate dates).

- [ ] **Step 4: Update the version footer**

In `src/App.tsx`, bump `APP_VERSION` / `APP_VERSION_DESC` to describe the unified CODAP export (e.g. desc "Unified CODAP export with typed attributes"). Then:

```bash
git add src/App.tsx
git commit -m "chore(dgt-77): bump version footer for unified CODAP export [DGT-77]"
```

---

## Self-Review

**Spec coverage:**
- Three per-category datasets, wide, date-keyed - Task 5.
- Performance export gap closed - Task 5 (Performance dataset + `usePerformanceData`).
- Per-attribute units on numerics - Tasks 1-2 (`unit` in spec + create payload).
- Time formatting (numeric + `h:mm` companion) - Tasks 2, 5.
- Categorical/ordinal labels (fixes Win/Loss `0/1`) - Task 3.
- Registry-driven metadata replacing `inferAttributeType` - Tasks 1, 2-4.
- Three-checkbox UI - Task 5.
- Custom metrics included with same treatment - Tasks 2-4 (`normalizeMetric` handles `CustomMetricDef`), Task 5 (`useCustomMetrics` filter by category).
- Forward path (multi-measurement `index` field) - out of scope, documented in spec; no task, by design.

**Placeholder scan:** none - every step has concrete code/commands.

**Type consistency:** `AttributeSpec` defined in Task 1, imported in Tasks 2/4; `NormalizedMetric`, `ExportColumn`, `RawValue`, `metricColumns`, `normalizeMetric`, `buildDataset`, `resolveTrackedMetrics`, `clockPattern` names match across tasks and the plugin. `readHealthField` (health) and `readBagField` (competition/performance) both satisfy `(entry, id) => RawValue`.
