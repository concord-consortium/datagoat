# Metric Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user override a built-in metric's goal value and chart y-axis top/bottom, with the overridden values flowing into every chart for that metric.

**Architecture:** A new top-level Firestore collection `metricOverrides` (one lean doc per user+metric) is loaded by a new `MetricOverridesContext`, which registers each override as a *partial* chart-config overlay merged on top of the metric's hardcoded config. The existing custom-metric form route (`/add-metric/:type/:metricId`) gains a gateway branch: when the id is a built-in metric, it renders a dedicated `MetricOverrideForm` instead of the custom-metric form. The edit pencil on `/setup/tracking` rows is enabled for built-in metrics, pointing at that same route.

**Tech Stack:** React 19 + TypeScript + Vite, Firebase Firestore, Vitest (colocated `*.test.ts`/`*.test.tsx`), CSS Modules.

**Spec:** `docs/superpowers/specs/2026-05-18-metric-overrides-design.md`

---

## File Structure

**Created:**
- `src/types/metricOverrides.ts` — `MetricOverride` document type.
- `src/contexts/MetricOverridesContext.tsx` — provider + `useMetricOverrides()` hook; loads override docs, registers the chart-config overlay.
- `src/contexts/MetricOverridesContext.test.tsx` — provider tests.
- `src/components/tracking/MetricOverrideForm.tsx` — the goal/axis edit form for a built-in metric.
- `src/components/tracking/MetricOverrideForm.test.tsx` — form tests.
- `src/components/tracking/SortableMetricRow.test.tsx` — row pencil test.

**Modified:**
- `src/charts/metricChartConfig.ts` — second overlay registry for partial overrides; merge in `getMetricChartConfig`; version-counter snapshot.
- `src/charts/metricChartConfig.test.ts` — override-merge tests.
- `src/charts/chartSeries.ts` — `lookupGoalLine` checks the override first.
- `src/charts/chartSeries.test.ts` — `lookupGoalLine` precedence tests.
- `src/charts/useChartSeries.ts` — rename the overlay-sync local to match its new numeric type.
- `firestore.rules` — owner-scoped rule for `metricOverrides`.
- `src/components/tracking/CustomMetricForm.tsx` — gateway renders `MetricOverrideForm` for built-in ids.
- `src/components/tracking/CustomMetricForm.test.tsx` — gateway built-in branch test.
- `src/components/tracking/SortableMetricRow.tsx` — render the edit pencil for built-in rows too.
- `src/App.tsx` — mount `MetricOverridesProvider`.

---

## Task 1: Partial-override overlay registry in metricChartConfig

A built-in metric override carries only `goalRaw` / `yTopRaw` / `yBottomRaw` and must merge *on top of* the metric's hardcoded config (preserving `formatValue`, `inverted`, `random`). This task adds a second overlay registry distinct from `_customConfigs` (which fully replaces config for custom metrics).

The overlay-change snapshot returned by `useChartConfigSync()` becomes a version counter so a change to *either* registry invalidates `useChartSeries`' memo. Today the snapshot is the `_customConfigs` object reference; consumers (`useChartSeries`) only use it as an opaque memo dependency and never read its contents, so a counter is a safe substitute.

**Files:**
- Modify: `src/charts/metricChartConfig.ts`
- Modify: `src/charts/useChartSeries.ts:65,86`
- Test: `src/charts/metricChartConfig.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this `describe` block to `src/charts/metricChartConfig.test.ts` (add any missing imports — `getMetricChartConfig` is almost certainly already imported; add `getBaseMetricChartConfig`, `getMetricOverride`, `setMetricOverrides`, `setCustomChartConfigs`):

```ts
import {
  getMetricChartConfig,
  getBaseMetricChartConfig,
  getMetricOverride,
  setMetricOverrides,
  setCustomChartConfigs,
} from "./metricChartConfig";

describe("metric overrides overlay", () => {
  afterEach(() => {
    setMetricOverrides({});
    setCustomChartConfigs({});
  });

  it("merges a partial override on top of the hardcoded config", () => {
    setMetricOverrides({ leanMass: { goalRaw: 70, yTopRaw: 90, yBottomRaw: 40 } });
    const config = getMetricChartConfig("leanMass");
    expect(config.goalRaw).toBe(70);
    expect(config.yTopRaw).toBe(90);
    expect(config.yBottomRaw).toBe(40);
    // Non-overridden fields survive from the hardcoded config.
    expect(config.unit).toBe("kg");
    expect(typeof config.formatValue).toBe("function");
    expect(typeof config.random).toBe("function");
  });

  it("merges only the fields the override actually sets", () => {
    setMetricOverrides({ hydration: { goalRaw: 2 } });
    const config = getMetricChartConfig("hydration");
    expect(config.goalRaw).toBe(2);
    // yTopRaw / inverted untouched by a goal-only override.
    expect(config.yTopRaw).toBe(1);
    expect(config.inverted).toBe(true);
  });

  it("getBaseMetricChartConfig ignores the override registry", () => {
    setMetricOverrides({ leanMass: { goalRaw: 70 } });
    expect(getBaseMetricChartConfig("leanMass").goalRaw).toBeUndefined();
  });

  it("getMetricOverride returns the registered partial, or undefined", () => {
    expect(getMetricOverride("leanMass")).toBeUndefined();
    setMetricOverrides({ leanMass: { goalRaw: 70 } });
    expect(getMetricOverride("leanMass")).toEqual({ goalRaw: 70 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/charts/metricChartConfig.test.ts`
Expected: FAIL — `getBaseMetricChartConfig`, `getMetricOverride`, `setMetricOverrides` are not exported.

- [ ] **Step 3: Add the override registry and merge logic**

In `src/charts/metricChartConfig.ts`, add this exported type just after the `MetricChartConfig` interface (after line 58):

```ts
// Partial chart-config override for a built-in metric. Only the three
// user-editable fields; everything else (formatValue, inverted,
// random, unit, ...) is inherited from the metric's base config.
export type MetricOverrideFields = Partial<
  Pick<MetricChartConfig, "goalRaw" | "yTopRaw" | "yBottomRaw">
>;
```

Replace the overlay block (lines 217-256, from `let _customConfigs` through the end of `getMetricChartConfig`) with:

```ts
let _customConfigs: Record<string, MetricChartConfig> = {};
// Partial overrides keyed by metric id. Distinct from _customConfigs:
// a custom-metric entry fully replaces the resolved config, whereas an
// override entry shallow-merges on top of the metric's base config so
// the built-in formatValue / inverted / random survive.
let _metricOverrides: Record<string, MetricOverrideFields> = {};
// Monotonic counter bumped whenever either overlay registry changes.
// useChartConfigSync exposes it so a change to *either* registry
// invalidates dependent memos (e.g. useChartSeries). Consumers treat
// it as an opaque dependency token and never read it.
let _overlayVersion = 0;
const _subscribers = new Set<() => void>();

function notifyOverlay(): void {
  _overlayVersion += 1;
  for (const callback of _subscribers) callback();
}

export function setCustomChartConfigs(
  next: Record<string, MetricChartConfig>,
): void {
  if (next === _customConfigs) return;
  _customConfigs = next;
  notifyOverlay();
}

export function setMetricOverrides(
  next: Record<string, MetricOverrideFields>,
): void {
  if (next === _metricOverrides) return;
  _metricOverrides = next;
  notifyOverlay();
}

function subscribeOverlay(callback: () => void): () => void {
  _subscribers.add(callback);
  return () => {
    _subscribers.delete(callback);
  };
}

function getOverlaySnapshot(): number {
  return _overlayVersion;
}

// Subscribe a component to overlay changes (custom-metric configs OR
// metric overrides) so subsequent getMetricChartConfig reads pick up
// new values. Components that render charts should call this once.
// Returns a version counter that changes on every overlay mutation —
// include it in useMemo dep arrays to invalidate on change.
export function useChartConfigSync(): number {
  return useSyncExternalStore(
    subscribeOverlay,
    getOverlaySnapshot,
    getOverlaySnapshot,
  );
}

// The metric's config without any user override applied: the built-in
// CONFIG entry, a custom-metric config, or DEFAULT_CONFIG.
export function getBaseMetricChartConfig(metricId: string): MetricChartConfig {
  return CONFIG[metricId] ?? _customConfigs[metricId] ?? DEFAULT_CONFIG;
}

// The partial override registered for a metric, if any.
export function getMetricOverride(
  metricId: string,
): MetricOverrideFields | undefined {
  return _metricOverrides[metricId];
}

export function getMetricChartConfig(metricId: string): MetricChartConfig {
  const base = getBaseMetricChartConfig(metricId);
  const override = _metricOverrides[metricId];
  return override ? { ...base, ...override } : base;
}
```

Note: the old `subscribeCustomChartConfigs` and `getCustomChartConfigsSnapshot` are intentionally gone — replaced by `subscribeOverlay` / `getOverlaySnapshot`.

- [ ] **Step 4: Update the useChartSeries consumer**

In `src/charts/useChartSeries.ts`, line 65 currently reads `const customChartConfigs = useChartConfigSync();` and line 86 lists `customChartConfigs` in the dep array. Rename for accuracy — replace line 65 with:

```ts
  const overlayVersion = useChartConfigSync();
```

and replace `customChartConfigs,` in the dep array (line 86) with:

```ts
    overlayVersion,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/charts/metricChartConfig.test.ts src/charts/useChartSeries.test.ts`
Expected: PASS. (If `useChartSeries.test.ts` does not exist, run only the first file.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/charts/metricChartConfig.ts src/charts/metricChartConfig.test.ts src/charts/useChartSeries.ts
git commit -m "feat(metrics): partial-override overlay in chart config [DGT-48]"
```

---

## Task 2: lookupGoalLine prefers a metric override

`lookupGoalLine` resolves the chart's goal line. An override `goalRaw` must win even over a profile-keyed goal (protein / sleepEfficiency / leanMass), so it is checked before the profile switch.

**Files:**
- Modify: `src/charts/chartSeries.ts:8,14-38`
- Test: `src/charts/chartSeries.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/charts/chartSeries.test.ts` (add a `setMetricOverrides` import from `./metricChartConfig`, and `afterEach` to the existing `vitest` import):

```ts
import { setMetricOverrides } from "./metricChartConfig";

describe("lookupGoalLine with metric overrides", () => {
  afterEach(() => {
    setMetricOverrides({});
  });

  it("an override goal beats a profile-keyed goal", () => {
    // leanMass is profile-keyed; without an override it resolves from
    // PROFILE_CHART_GOALS for a known profile key.
    const profileGoal = lookupGoalLine("leanMass", "Male/Strength and Power");
    expect(typeof profileGoal).toBe("number");
    setMetricOverrides({ leanMass: { goalRaw: 88 } });
    expect(lookupGoalLine("leanMass", "Male/Strength and Power")).toBe(88);
  });

  it("an override goal beats a static config goal", () => {
    expect(lookupGoalLine("hydration", "Male/Endurance")).toBe(3);
    setMetricOverrides({ hydration: { goalRaw: 2 } });
    expect(lookupGoalLine("hydration", "Male/Endurance")).toBe(2);
  });

  it("falls through to the normal resolution when no override is set", () => {
    expect(lookupGoalLine("hydration", "Male/Endurance")).toBe(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/charts/chartSeries.test.ts`
Expected: FAIL — the override is ignored, so `lookupGoalLine("leanMass", ...)` still returns the profile goal.

- [ ] **Step 3: Add the override precedence**

In `src/charts/chartSeries.ts`, line 8 imports `getMetricChartConfig`. Replace that import line with:

```ts
import { getMetricChartConfig, getMetricOverride } from "./metricChartConfig";
```

Replace the `lookupGoalLine` function body (lines 14-38) with:

```ts
export function lookupGoalLine(
  metricId: string,
  profileKey: string,
): number | undefined {
  // A user override of the goal wins over every default — including
  // the profile-keyed goals below.
  const override = getMetricOverride(metricId);
  if (override?.goalRaw !== undefined) {
    return override.goalRaw;
  }
  const goals = PROFILE_CHART_GOALS[profileKey];
  if (goals) {
    switch (metricId) {
      case "sleepEfficiency":
        return goals.sleepEffGoal;
      case "protein":
        return goals.proteinGoal;
      case "leanMass":
        return goals.leanMassGoal;
      case "goals":
        return goals.goalsGoal;
      case "assists":
        return goals.assistsGoal;
      case "yards":
        return goals.yardsGoal;
      case "tackles":
        return goals.tacklesGoal;
    }
  }
  return getMetricChartConfig(metricId).goalRaw;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/charts/chartSeries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/charts/chartSeries.ts src/charts/chartSeries.test.ts
git commit -m "feat(metrics): lookupGoalLine prefers a metric override [DGT-48]"
```

---

## Task 3: MetricOverride type and Firestore rule

**Files:**
- Create: `src/types/metricOverrides.ts`
- Modify: `firestore.rules`

- [ ] **Step 1: Create the type**

Create `src/types/metricOverrides.ts`:

```ts
// A per-user override of a metric's goal value and / or chart y-axis
// bounds. One document per (user, metric) — the Firestore doc id is
// the deterministic key `${ownerId}_${metricId}`. The document never
// stores any of the metric's definition data (name, unit, ...), so it
// stays correct if built-in metric definitions later move to the DB.
export interface MetricOverride {
  id: string;
  ownerId: string;
  metricId: string;
  goalRaw?: number;
  yTopRaw?: number;
  yBottomRaw?: number;
  // ms epoch; provider-managed via server timestamps.
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Add the Firestore security rule**

In `firestore.rules`, insert this block immediately after the closing `}` of the `match /metricDefinitions/{metricId}` block (after line 26, before the `}` that closes the documents match):

```
    // Top-level per-user metric overrides (goal / y-axis bounds for
    // built-in metrics). Owner-scoped exactly like metricDefinitions:
    // a user reads / writes only docs whose `ownerId` is their uid,
    // and `ownerId` is pinned to the caller on both create and update.
    match /metricOverrides/{overrideId} {
      allow read: if request.auth != null
                  && resource.data.ownerId == request.auth.uid;
      allow create: if request.auth != null
                    && request.resource.data.ownerId == request.auth.uid;
      allow update: if request.auth != null
                    && resource.data.ownerId == request.auth.uid
                    && request.resource.data.ownerId == request.auth.uid;
      allow delete: if request.auth != null
                    && resource.data.ownerId == request.auth.uid;
    }
```

- [ ] **Step 3: Verify the rules file parses**

Run: `npx firebase deploy --only firestore:rules --dry-run` if available, otherwise visually confirm the braces balance (the file should end with three closing braces: the `match`-documents, the `service`, and nothing else — count them).
Expected: no syntax error.

- [ ] **Step 4: Commit**

```bash
git add src/types/metricOverrides.ts firestore.rules
git commit -m "feat(metrics): MetricOverride type and Firestore rule [DGT-48]"
```

---

## Task 4: MetricOverridesContext

A context paralleling `CustomMetricsContext`: snapshot-listens to the current user's `metricOverrides` docs, registers the chart-config overlay, and exposes `getOverride` / `saveOverride`. The Firestore doc id is deterministic (`${uid}_${metricId}`) so `saveOverride` is a single `setDoc(..., { merge: true })` upsert with no read-then-write.

**Files:**
- Create: `src/contexts/MetricOverridesContext.tsx`
- Create: `src/contexts/MetricOverridesContext.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the context**

Create `src/contexts/MetricOverridesContext.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import type { MetricOverride } from "../types/metricOverrides";
import {
  setMetricOverrides,
  type MetricOverrideFields,
} from "../charts/metricChartConfig";

// The three editable fields, as the form passes them in.
export type MetricOverridePatch = {
  goalRaw?: number;
  yTopRaw?: number;
  yBottomRaw?: number;
};

interface MetricOverridesValue {
  overrides: MetricOverride[];
  // True until the first snapshot lands (or there is no user / a test
  // seed short-circuits the subscription).
  loading: boolean;
  getOverride: (metricId: string) => MetricOverride | undefined;
  saveOverride: (metricId: string, patch: MetricOverridePatch) => Promise<void>;
}

const MetricOverridesContext = createContext<MetricOverridesValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  // Test seam — pre-seeds the list AND short-circuits the Firestore
  // subscription. Production callers omit this.
  initialOverrides?: MetricOverride[];
}

const COLLECTION = "metricOverrides";

// Deterministic doc id: one override doc per (user, metric).
function overrideDocId(uid: string, metricId: string): string {
  return `${uid}_${metricId}`;
}

// Firestore Timestamp -> ms epoch.
function tsToMillis(ts: unknown): number {
  if (
    ts &&
    typeof ts === "object" &&
    typeof (ts as Timestamp).toMillis === "function"
  ) {
    return (ts as Timestamp).toMillis();
  }
  return 0;
}

// A finite number or undefined — never NaN. Guards both the Firestore
// reader and the overlay builder against a corrupt / partially-written
// doc producing NaN downstream in linearScale / SVG attributes.
function finiteOrUndefined(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

export function fromDoc(
  id: string,
  data: Record<string, unknown>,
): MetricOverride {
  return {
    id,
    ownerId: String(data.ownerId ?? ""),
    metricId: String(data.metricId ?? ""),
    goalRaw: finiteOrUndefined(data.goalRaw),
    yTopRaw: finiteOrUndefined(data.yTopRaw),
    yBottomRaw: finiteOrUndefined(data.yBottomRaw),
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

// Build the chart-config overlay: one partial entry per override,
// carrying only the fields that are finite numbers.
function buildOverlay(
  overrides: MetricOverride[],
): Record<string, MetricOverrideFields> {
  const overlay: Record<string, MetricOverrideFields> = {};
  for (const o of overrides) {
    const fields: MetricOverrideFields = {};
    if (o.goalRaw !== undefined) fields.goalRaw = o.goalRaw;
    if (o.yTopRaw !== undefined) fields.yTopRaw = o.yTopRaw;
    if (o.yBottomRaw !== undefined) fields.yBottomRaw = o.yBottomRaw;
    if (Object.keys(fields).length > 0) overlay[o.metricId] = fields;
  }
  return overlay;
}

export function MetricOverridesProvider({
  children,
  initialOverrides,
}: ProviderProps) {
  const { user } = useAuth();
  const [overrides, setOverrides] = useState<MetricOverride[]>(
    initialOverrides ?? [],
  );
  const [loading, setLoading] = useState<boolean>(
    initialOverrides === undefined,
  );

  useEffect(() => {
    if (initialOverrides !== undefined) {
      setLoading(false);
      return;
    }
    if (!user) {
      setOverrides([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, COLLECTION),
      where("ownerId", "==", user.uid),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next: MetricOverride[] = [];
        snap.forEach((d) => {
          next.push(fromDoc(d.id, d.data({ serverTimestamps: "estimate" })));
        });
        setOverrides(next);
        setLoading(false);
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error("MetricOverrides onSnapshot error", err);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [user, initialOverrides]);

  // Sync the runtime overlay so getMetricChartConfig / lookupGoalLine
  // see the user's overrides. Effect (post-commit) so render stays pure.
  const overlay = useMemo(() => buildOverlay(overrides), [overrides]);
  useEffect(() => {
    setMetricOverrides(overlay);
  }, [overlay]);

  const saveOverride = useCallback<MetricOverridesValue["saveOverride"]>(
    async (metricId, patch) => {
      if (!user) {
        throw new Error("saveOverride requires a signed-in user");
      }
      const ref = doc(db, COLLECTION, overrideDocId(user.uid, metricId));
      const existing = overrides.find((o) => o.metricId === metricId);
      const payload: Record<string, unknown> = {
        ownerId: user.uid,
        metricId,
        updatedAt: serverTimestamp(),
      };
      // Only write fields that are finite; never write undefined.
      if (patch.goalRaw !== undefined) payload.goalRaw = patch.goalRaw;
      if (patch.yTopRaw !== undefined) payload.yTopRaw = patch.yTopRaw;
      if (patch.yBottomRaw !== undefined) payload.yBottomRaw = patch.yBottomRaw;
      // Stamp createdAt only on first write so a later save doesn't
      // reset it (merge:true would otherwise overwrite it every time).
      if (!existing) payload.createdAt = serverTimestamp();
      await setDoc(ref, payload, { merge: true });
    },
    [user, overrides],
  );

  const value = useMemo<MetricOverridesValue>(
    () => ({
      overrides,
      loading,
      getOverride: (metricId) =>
        overrides.find((o) => o.metricId === metricId),
      saveOverride,
    }),
    [overrides, loading, saveOverride],
  );

  return (
    <MetricOverridesContext.Provider value={value}>
      {children}
    </MetricOverridesContext.Provider>
  );
}

// Empty fallback when no provider is mounted — keeps unrelated tests
// rendering without wrapping in MetricOverridesProvider.
const NOOP_VALUE: MetricOverridesValue = {
  overrides: [],
  loading: false,
  getOverride: () => undefined,
  saveOverride: async () => {
    throw new Error("saveOverride called without MetricOverridesProvider");
  },
};

export function useMetricOverrides(): MetricOverridesValue {
  const ctx = useContext(MetricOverridesContext);
  return ctx ?? NOOP_VALUE;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/contexts/MetricOverridesContext.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const setDocSpy = vi.fn(async () => {});
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  onSnapshot: () => () => {},
  query: () => ({}),
  serverTimestamp: () => ({ __ts: true }),
  setDoc: (...args: unknown[]) => setDocSpy(...args),
  where: () => ({}),
}));
vi.mock("../firebase", () => ({ db: {} }));
vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1" } }),
}));

import {
  MetricOverridesProvider,
  useMetricOverrides,
} from "./MetricOverridesContext";
import { getMetricOverride, setMetricOverrides } from "../charts/metricChartConfig";
import type { MetricOverride } from "../types/metricOverrides";

function seed(partial: Partial<MetricOverride>): MetricOverride {
  return {
    id: "u1_leanMass",
    ownerId: "u1",
    metricId: "leanMass",
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

function Probe() {
  const { getOverride } = useMetricOverrides();
  const o = getOverride("leanMass");
  return <div data-testid="goal">{o ? String(o.goalRaw) : "none"}</div>;
}

describe("MetricOverridesProvider", () => {
  it("exposes seeded overrides via getOverride", () => {
    render(
      <MetricOverridesProvider initialOverrides={[seed({ goalRaw: 70 })]}>
        <Probe />
      </MetricOverridesProvider>,
    );
    expect(screen.getByTestId("goal").textContent).toBe("70");
  });

  it("registers the chart-config overlay for seeded overrides", () => {
    setMetricOverrides({});
    render(
      <MetricOverridesProvider
        initialOverrides={[seed({ goalRaw: 70, yTopRaw: 90, yBottomRaw: 40 })]}
      >
        <div />
      </MetricOverridesProvider>,
    );
    expect(getMetricOverride("leanMass")).toEqual({
      goalRaw: 70,
      yTopRaw: 90,
      yBottomRaw: 40,
    });
    setMetricOverrides({});
  });

  it("saveOverride upserts a doc with the deterministic id and ownerId", async () => {
    setDocSpy.mockClear();
    let save: ((m: string, p: Record<string, number>) => Promise<void>) | null =
      null;
    function Grab() {
      save = useMetricOverrides().saveOverride;
      return null;
    }
    render(
      <MetricOverridesProvider initialOverrides={[]}>
        <Grab />
      </MetricOverridesProvider>,
    );
    await save!("leanMass", { goalRaw: 80, yTopRaw: 100, yBottomRaw: 0 });
    expect(setDocSpy).toHaveBeenCalledTimes(1);
    const [ref, payload, options] = setDocSpy.mock.calls[0] as [
      { id: string },
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(ref.id).toBe("u1_leanMass");
    expect(payload.ownerId).toBe("u1");
    expect(payload.metricId).toBe("leanMass");
    expect(payload.goalRaw).toBe(80);
    expect(options).toEqual({ merge: true });
  });
});
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npx vitest run src/contexts/MetricOverridesContext.test.tsx`
Expected: PASS (the context was written in Step 1).

- [ ] **Step 4: Mount the provider in App.tsx**

In `src/App.tsx`, add the import after line 6:

```tsx
import { MetricOverridesProvider } from "./contexts/MetricOverridesContext";
```

Then wrap `MetricOverridesProvider` immediately inside `CustomMetricsProvider` — replace lines 20-24:

```tsx
              <CustomMetricsProvider>
                <MetricOverridesProvider>
                  <DataProvider>
                    <AppRoutes />
                  </DataProvider>
                </MetricOverridesProvider>
              </CustomMetricsProvider>
```

- [ ] **Step 5: Typecheck and run the test again**

Run: `npx tsc --noEmit && npx vitest run src/contexts/MetricOverridesContext.test.tsx`
Expected: no type errors; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/MetricOverridesContext.tsx src/contexts/MetricOverridesContext.test.tsx src/App.tsx
git commit -m "feat(metrics): MetricOverridesContext and provider [DGT-48]"
```

---

## Task 5: MetricOverrideForm component

A focused form for editing one built-in metric's goal and y-axis bounds. It reuses `TextField` and the `CustomMetricForm.module.css` classes. Non-editable definition fields (Name, Unit) render disabled; the goal-determination sentence from `resolveGoalText` is shown; and when an override already exists a "customized" note is shown.

Pre-population: the goal field shows the current *effective* goal via `lookupGoalLine` (which returns the override if one exists, else the profile/static default); the axis fields show the existing override values falling back to the base config.

Validation: goal must be finite and, when the metric defines both `min` and `max`, within `[min, max]`; the y-axis pair must keep the base config's orientation (`yTop > yBottom` for a normal metric, `yTop < yBottom` for an inverted one such as hydration).

**Files:**
- Create: `src/components/tracking/MetricOverrideForm.tsx`
- Create: `src/components/tracking/MetricOverrideForm.test.tsx`
- Modify: `src/components/tracking/CustomMetricForm.module.css` (add a `.hint` class)

- [ ] **Step 1: Add the hint CSS class**

Append to `src/components/tracking/CustomMetricForm.module.css`:

```css
.hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--subtext);
}
```

- [ ] **Step 2: Create the component**

Create `src/components/tracking/MetricOverrideForm.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMetricOverrides } from "../../contexts/MetricOverridesContext";
import { useUser } from "../../contexts/UserContext";
import {
  capitalizeAthleteType,
  capitalizeGender,
  lookupGoalLine,
} from "../../charts/chartSeries";
import { getBaseMetricChartConfig } from "../../charts/metricChartConfig";
import { resolveGoalText } from "../../data/metricGoals";
import { TextField } from "../form/TextField";
import type { MetricDefinition } from "../../metrics/types";
import css from "./CustomMetricForm.module.css";

interface MetricOverrideFormProps {
  type: "health" | "competition";
  metric: MetricDefinition;
}

// Edit form for a built-in metric: only the goal and the chart y-axis
// bounds are editable. Everything else is shown disabled / read-only.
export function MetricOverrideForm({ type, metric }: MetricOverrideFormProps) {
  const navigate = useNavigate();
  const { getOverride, saveOverride } = useMetricOverrides();
  const { loadState } = useUser();
  const profile = loadState.status === "loaded" ? loadState.profile : null;

  const existing = getOverride(metric.id);
  const base = getBaseMetricChartConfig(metric.id);
  const profileKey = profile
    ? `${capitalizeGender(profile.gender)}/${capitalizeAthleteType(
        profile.athleteType,
      )}`
    : "";
  const goalText = resolveGoalText(metric.id, profileKey);

  // Initial values. Goal: the current effective goal (lookupGoalLine
  // returns the override if present, else the profile/static default).
  // Axis: the existing override falling back to the base config — read
  // straight from the override doc so a fresh deep-link works before
  // the overlay effect has registered.
  const [goalRaw, setGoalRaw] = useState<string>(() => {
    const effective =
      existing?.goalRaw ?? lookupGoalLine(metric.id, profileKey);
    return effective === undefined ? "" : String(effective);
  });
  const [yTopRaw, setYTopRaw] = useState<string>(
    String(existing?.yTopRaw ?? base.yTopRaw),
  );
  const [yBottomRaw, setYBottomRaw] = useState<string>(
    String(existing?.yBottomRaw ?? base.yBottomRaw),
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const goal = Number(goalRaw);
    const top = Number(yTopRaw);
    const bottom = Number(yBottomRaw);
    if ([goal, top, bottom].some((v) => !Number.isFinite(v))) {
      setError("Goal, y-axis top, and y-axis bottom must be numbers.");
      return;
    }
    // Range check: the goal must fit the metric's built-in data range
    // when the definition declares both bounds.
    if (
      metric.min !== undefined &&
      metric.max !== undefined &&
      (goal < metric.min || goal > metric.max)
    ) {
      setError(
        `Goal must be between ${metric.min} and ${metric.max}.`,
      );
      return;
    }
    // The override must keep the base config's axis orientation. Most
    // metrics ascend (top > bottom); an inverted metric (hydration)
    // descends (top < bottom).
    const baseAscending = base.yTopRaw > base.yBottomRaw;
    if (baseAscending && top <= bottom) {
      setError("Y-axis top must be greater than y-axis bottom.");
      return;
    }
    if (!baseAscending && top >= bottom) {
      setError("Y-axis top must be less than y-axis bottom.");
      return;
    }
    try {
      await saveOverride(metric.id, {
        goalRaw: goal,
        yTopRaw: top,
        yBottomRaw: bottom,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to save metric override", err);
      setError("Couldn't save your changes. Please try again.");
      return;
    }
    navigate("/setup/tracking");
  }

  return (
    <form className={css.form} onSubmit={handleSubmit} noValidate>
      <TextField
        id="mo-name"
        label="Name"
        value={metric.name}
        disabled
        onChange={() => {}}
      />
      <TextField
        id="mo-unit"
        label="Unit"
        value={metric.displayUnit ?? metric.unit}
        disabled
        onChange={() => {}}
      />

      {existing && (
        <p className={css.hint}>This metric has been customized.</p>
      )}
      {goalText && (
        <p className={css.hint}>Recommended goal: {goalText}.</p>
      )}

      <TextField
        id="mo-goal"
        label="Goal"
        type="number"
        inputMode="decimal"
        value={goalRaw}
        onChange={(e) => setGoalRaw(e.target.value)}
      />

      <div className={css.row}>
        <TextField
          id="mo-ytop"
          label="Y-axis top"
          type="number"
          inputMode="decimal"
          value={yTopRaw}
          onChange={(e) => setYTopRaw(e.target.value)}
        />
        <TextField
          id="mo-ybot"
          label="Y-axis bottom"
          type="number"
          inputMode="decimal"
          value={yBottomRaw}
          onChange={(e) => setYBottomRaw(e.target.value)}
        />
      </div>

      {error && <p className={css.error}>{error}</p>}

      <div className={css.actions}>
        <button
          type="button"
          className={css.secondary}
          onClick={() => navigate("/setup/tracking")}
        >
          Cancel
        </button>
        <button type="submit" className={css.primary}>
          Save
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Write the failing tests**

Create `src/components/tracking/MetricOverrideForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  onSnapshot: () => () => {},
  query: () => ({}),
  serverTimestamp: () => ({ __ts: true }),
  setDoc: vi.fn(async () => {}),
  where: () => ({}),
}));
vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1" } }),
}));
vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({
    loadState: {
      status: "loaded",
      profile: { gender: "male", athleteType: "endurance" },
    },
  }),
}));

import { MetricOverrideForm } from "./MetricOverrideForm";
import { MetricOverridesProvider } from "../../contexts/MetricOverridesContext";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import type { MetricOverride } from "../../types/metricOverrides";

const leanMass = HEALTH_METRICS.find((m) => m.id === "leanMass")!;
const hydration = HEALTH_METRICS.find((m) => m.id === "hydration")!;

function renderForm(
  metric = leanMass,
  overrides: MetricOverride[] = [],
) {
  return render(
    <MemoryRouter>
      <MetricOverridesProvider initialOverrides={overrides}>
        <MetricOverrideForm type="health" metric={metric} />
      </MetricOverridesProvider>
    </MemoryRouter>,
  );
}

describe("MetricOverrideForm", () => {
  it("renders Name and Unit disabled", () => {
    renderForm();
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByLabelText("Unit")).toBeDisabled();
  });

  it("leaves Goal and the y-axis fields editable", () => {
    renderForm();
    expect(screen.getByLabelText("Goal")).not.toBeDisabled();
    expect(screen.getByLabelText("Y-axis top")).not.toBeDisabled();
    expect(screen.getByLabelText("Y-axis bottom")).not.toBeDisabled();
  });

  it("shows a 'customized' note only when an override exists", () => {
    renderForm();
    expect(screen.queryByText(/has been customized/i)).toBeNull();
    renderForm(leanMass, [
      {
        id: "u1_leanMass",
        ownerId: "u1",
        metricId: "leanMass",
        goalRaw: 70,
        yTopRaw: 90,
        yBottomRaw: 40,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    expect(screen.getAllByText(/has been customized/i).length).toBeGreaterThan(
      0,
    );
  });

  it("rejects a goal outside the metric's [min, max] range", () => {
    // hydration declares min:1, max:8.
    renderForm(hydration);
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "99" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/between 1 and 8/i)).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("saves a valid override and navigates back", async () => {
    renderForm(leanMass);
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "75" },
    });
    fireEvent.change(screen.getByLabelText("Y-axis top"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Y-axis bottom"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/setup/tracking"),
    );
  });
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/tracking/MetricOverrideForm.test.tsx`
Expected: PASS. If `toBeDisabled` / `toBeInTheDocument` are unavailable, the project's `src/test/setup.ts` already wires `@testing-library/jest-dom`; confirm the test file is matched by the Vitest `setupFiles` config (it is — all `*.test.tsx` are).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/tracking/MetricOverrideForm.tsx src/components/tracking/MetricOverrideForm.test.tsx src/components/tracking/CustomMetricForm.module.css
git commit -m "feat(metrics): MetricOverrideForm for built-in goal/axis editing [DGT-48]"
```

---

## Task 6: CustomMetricForm gateway routes built-in ids to MetricOverrideForm

The `/add-metric/:type/:metricId` route is served by `CustomMetricForm`. Its gateway resolves `:metricId` against the custom-metric list. This task makes the gateway first check the built-in registries — if the id is a built-in metric, it renders `MetricOverrideForm`; otherwise the existing custom-metric path runs unchanged.

**Files:**
- Modify: `src/components/tracking/CustomMetricForm.tsx:1-18,206-247`
- Test: `src/components/tracking/CustomMetricForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test to `src/components/tracking/CustomMetricForm.test.tsx` (inside the existing top-level `describe`, reusing the file's existing mocks and render helper). If the file renders the form via a router helper at a path, render at `/add-metric/health/leanMass`; adapt to the file's existing render utility:

```ts
it("renders the override form for a built-in metric id", async () => {
  // leanMass is a built-in health metric — the gateway should route to
  // MetricOverrideForm, which shows a disabled Name field.
  renderAt("/add-metric/health/leanMass");
  const name = await screen.findByLabelText("Name");
  expect(name).toBeDisabled();
  expect((name as HTMLInputElement).value).toBe("Lean Mass");
});
```

If `CustomMetricForm.test.tsx` has no `renderAt` helper, add this minimal one near the top of the file (after the imports), reusing the file's existing provider mocks:

```tsx
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { CustomMetricsProvider } from "../../contexts/CustomMetricsContext";
import { MetricOverridesProvider } from "../../contexts/MetricOverridesContext";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CustomMetricsProvider initialMetrics={[]}>
        <MetricOverridesProvider initialOverrides={[]}>
          <Routes>
            <Route
              path="/add-metric/:type/:metricId"
              element={<CustomMetricForm />}
            />
          </Routes>
        </MetricOverridesProvider>
      </CustomMetricsProvider>
    </MemoryRouter>,
  );
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/tracking/CustomMetricForm.test.tsx`
Expected: FAIL — the gateway does not recognize `leanMass`; with `initialMetrics={[]}` it `Navigate`s to `/setup/tracking`, so `getByLabelText("Name")` is never found.

- [ ] **Step 3: Update the gateway**

In `src/components/tracking/CustomMetricForm.tsx`, the imports at lines 7-8 already pull in `HEALTH_METRICS` and `COMPETITION_METRICS`. Add these imports after line 8:

```tsx
import { ADDABLE_HEALTH, ADDABLE_COMPETITION } from "../../metrics/addableMetrics";
import { MetricOverrideForm } from "./MetricOverrideForm";
```

In the `CustomMetricForm` gateway function, replace the `if (metricId) {` block (lines 215-244) so the built-in check runs first:

```tsx
  if (metricId) {
    // Built-in metric id? Route to the goal/axis override form. The
    // built-in registries resolve synchronously, so this is decided
    // before the custom-metric snapshot is consulted below. Built-in
    // ids (e.g. "leanMass") never collide with custom-metric ids.
    const builtIns =
      type === "health"
        ? [...HEALTH_METRICS, ...ADDABLE_HEALTH]
        : [...COMPETITION_METRICS, ...ADDABLE_COMPETITION];
    const builtIn = builtIns.find((m) => m.id === metricId);
    if (builtIn) {
      return <MetricOverrideForm type={type} metric={builtIn} />;
    }

    if (loading) {
      return <p className={css.loading}>Loading…</p>;
    }
    const editing = getMetric(metricId);
    if (!editing) {
      return <Navigate to="/setup/tracking" replace />;
    }
    // Redirect to the canonical type-matched route if the URL :type
    // disagrees with the metric's actual metricType. Without this,
    // Cancel/Save/Delete navigation in the body would go back to the
    // wrong type's list page.
    if (editing.metricType !== type) {
      return (
        <Navigate
          to={`/add-metric/${editing.metricType}/${editing.id}`}
          replace
        />
      );
    }
    // The body's edit-confirmation guard reads health/competition
    // entries to decide whether changing input type or unit needs user
    // confirmation. While those logs are still loading, the body would
    // fall back to empty arrays and silently skip the prompt — wait for
    // both to land so the prompt fires reliably.
    if (health.status !== "loaded" || competition.status !== "loaded") {
      return <p className={css.loading}>Loading…</p>;
    }
    return <CustomMetricFormBody type={type} editing={editing} />;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/tracking/CustomMetricForm.test.tsx`
Expected: PASS, and the existing tests in the file still pass.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/tracking/CustomMetricForm.tsx src/components/tracking/CustomMetricForm.test.tsx
git commit -m "feat(metrics): route built-in metric ids to the override form [DGT-48]"
```

---

## Task 7: Edit pencil for built-in metric rows

`SortableMetricRow` renders the edit-pencil cell only when `isCustom`. This task renders it for built-in rows too, pointing at the same `/add-metric/:type/:id` route. The info-cell icon logic (which also reads `isCustom`) is unchanged.

**Files:**
- Modify: `src/components/tracking/SortableMetricRow.tsx:90-103`
- Test: `src/components/tracking/SortableMetricRow.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/tracking/SortableMetricRow.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { SortableMetricRow } from "./SortableMetricRow";

function renderRow(isCustom: boolean) {
  return render(
    <MemoryRouter>
      <DndContext>
        <SortableContext items={["leanMass"]}>
          <table>
            <tbody>
              <SortableMetricRow
                id="leanMass"
                name="Lean Mass"
                type="health"
                checked
                onToggleCheck={vi.fn()}
                reorderHintId="hint"
                isCustom={isCustom}
              />
            </tbody>
          </table>
        </SortableContext>
      </DndContext>
    </MemoryRouter>,
  );
}

describe("SortableMetricRow edit pencil", () => {
  it("renders an Edit link for a built-in metric row", () => {
    renderRow(false);
    const link = screen.getByRole("link", { name: "Edit Lean Mass" });
    expect(link).toHaveAttribute("href", "/add-metric/health/leanMass");
  });

  it("renders an Edit link for a custom metric row", () => {
    renderRow(true);
    expect(
      screen.getByRole("link", { name: "Edit Lean Mass" }),
    ).toHaveAttribute("href", "/add-metric/health/leanMass");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/tracking/SortableMetricRow.test.tsx`
Expected: FAIL on the built-in case — `getByRole("link", { name: "Edit Lean Mass" })` finds nothing because the pencil is gated behind `isCustom`.

- [ ] **Step 3: Render the pencil for all rows**

In `src/components/tracking/SortableMetricRow.tsx`, replace the edit-pencil `<td>` block (lines 90-103) with:

```tsx
      <td>
        {/* Edit-pencil cell: links to the metric's edit form. For a
            custom metric this opens CustomMetricForm; for a built-in
            it opens MetricOverrideForm (goal / y-axis override). The
            route is the same — the form's gateway dispatches on the
            id. */}
        <Link
          to={`/add-metric/${type}/${id}`}
          className={css.metricInfoBtn}
          aria-label={`Edit ${name}`}
        >
          ✏︎
        </Link>
      </td>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/tracking/SortableMetricRow.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Run the tracking-page tests for regressions**

Run: `npx vitest run src/components/tracking/`
Expected: PASS. If a `TrackedDataSetup` or `TrackedMetricsTable` test asserted that built-in rows have an *empty* edit cell, update that assertion to expect the `Edit <name>` link instead — the new behavior is intentional.

- [ ] **Step 6: Commit**

```bash
git add src/components/tracking/SortableMetricRow.tsx src/components/tracking/SortableMetricRow.test.tsx
git commit -m "feat(metrics): edit pencil on built-in metric rows [DGT-48]"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: all tests pass.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: TypeScript check passes and the Vite production build succeeds.

- [ ] **Step 3: Manual smoke test (emulators)**

Start `npm run emulators` and `npm run dev` in two terminals, then:
1. Sign in, complete onboarding to reach `/setup/tracking`.
2. Click the edit pencil on a built-in metric (e.g. Lean Mass). Confirm `MetricOverrideForm` opens with Name/Unit disabled and Goal/Y-axis fields editable.
3. Enter a goal outside the data range for a metric that has min/max (Hydration) — confirm the range error shows.
4. Save a valid goal + y-axis change for Lean Mass.
5. Open the metric's chart (`/health/leanMass` via the info link). Confirm the goal line and axis reflect the saved override.
6. Re-open the edit pencil — confirm the "This metric has been customized." note shows and the fields are pre-populated with the saved values.

- [ ] **Step 4: Final commit (if Step 3 surfaced fixes)**

Commit any fixes with message `fix(metrics): <description> [DGT-48]`.

---

## Self-Review Notes

- **Spec coverage:** storage collection (Task 3), `MetricOverridesContext` (Task 4), partial overlay merge (Task 1), `lookupGoalLine` precedence (Task 2), form reuse via the `/add-metric` gateway (Tasks 5-6), pencil for built-ins (Task 7), range validation (Task 5). All spec sections map to a task.
- **Form reuse refinement:** the spec said "CustomMetricForm gains an override mode." The plan realizes this as the `CustomMetricForm` *gateway* dispatching to a dedicated, well-bounded `MetricOverrideForm` sibling component (reusing `TextField` and `CustomMetricForm.module.css`) rather than threading an override flag through the 620-line custom-metric body and its `topLevel`/`levels` state machine. Same route, same field styling, non-editable fields disabled — the user-visible result the spec describes, with cleaner module boundaries.
- **Deferred (per spec):** revert-to-default, clearing overrides on profile change, a chart-side override badge.
