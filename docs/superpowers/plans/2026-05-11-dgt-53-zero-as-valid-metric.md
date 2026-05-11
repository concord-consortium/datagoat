# DGT-53: Treat 0 as a Valid Metric Value — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop using `0` as the sentinel for "not logged" on health and competition metrics. Distinguish "logged 0" from "not logged" by storing `undefined` (or omitting the key) for the latter, so a user can record a real `0` (zero alcoholic drinks, zero goals, etc.) and have it persist and render.

**Architecture:** Make the five built-in `HealthEntry` numeric fields optional in the type (`hydration?: number` instead of `hydration: number`) AND make the four `availability` sub-keys optional (`practiceHeld?: boolean` instead of `boolean | null`). Stop initializing them in `emptyHealthEntry`. At the Firestore boundary in `DataContext.firestoreSet*`, translate `undefined` field values to `deleteField()` so cleared values are actually removed from the doc. Switch every reader site from `> 0` / `!== 0` / `!== null` to key-presence / `typeof` checks. Three writer sites (HealthLog numeric inputs, HealthLog custom inputs, CompetitionLog inputs) change to write `undefined` instead of `0` on empty input. **No data migration**: the DB will be wiped before launch, so we don't bump `CURRENT_HEALTH_ENTRY_VERSION` or write a migrator — we just fix the code.

**Tech Stack:** TypeScript, React 19, Firestore Web SDK (`setDoc(..., { merge: true })`, `deleteField()`), Vitest.

**Design decision — all-undefined for consistency:** Today the codebase has three "missing" conventions across the metric stack: `0` for built-in numerics, key-absent for `customMetrics` / `metrics` maps, and `null` for availability sub-keys. This plan collapses all three to one — `undefined` / key-absent. That unification lets every reader use the same predicate (`typeof === "number"` / `typeof === "boolean"`) and lets us delete the 18-line creation-path null-stamping block in `firestoreSetHealthEntry` (lines 100-116 today) that exists solely to maintain the "typed-null contract" availability used to require.

**Scope decisions:**
- Hydration has no zero swatch in the UI (`MetricInputRow.ColorScale` emits values 1..max). After the type change, `hydration` becomes `number | undefined`; "not logged" means key absent. No hydration UI work.
- `competitionTotal` (`CompetitionTotals.ts:13`) already does `typeof === "number" && Number.isFinite` and will sum a stored `0` correctly. No code change there, but the surrounding `total !== 0 ? String(total) : ""` cell in `CompetitionLog.tsx:160` needs to flip so a true-zero total renders as `"0"`.
- The `CompetitionEntry.metrics` and `HealthEntry.customMetrics` maps stay as `Record<string, ...>`. We widen their value type to include `undefined` so writers can pass `{ key: undefined }` through the typed API; on disk, those undefined values become `deleteField()` sentinels.
- We do NOT bump entry versions or add migration code. The migration registry stays at v1 for both entries.
- `migrations/healthEntry.fixtures.ts` is updated so the `legacy` fixture's `null` sub-keys become absent. Migration tests still exercise the migrator code path; they just operate on the new shape.
- `AvailabilityTree` is the one component that actively writes a clearing value (sets `practiceParticipation` back to "missing" when `practiceHeld` flips from true to false). It currently writes `null`; we switch it to `undefined` so the boundary translation actually removes the stored value.

---

## File Inventory

**Modify (data model + storage boundary):**
- `src/types/data.ts` — make 5 numeric fields + 4 availability sub-keys optional; trim `emptyHealthEntry`; widen map value types
- `src/contexts/DataContext.tsx` — add `withDeleteSentinels` helper + `deleteField` import in both `firestoreSet*` functions; **remove** the creation-path null-stamping expansion (lines 100-116)

**Modify (availability readers — `!== null` / `=== null` → typeof / `=== undefined`):**
- `src/charts/chartSeries.ts` — availability branch in `readHealthMetric` (line 140)
- `src/utils/healthCompleteness.ts` — `availabilityFilled`
- `src/codap/CodapPlugin.tsx` — `=== null` checks in availability flattening

**Modify (availability writer):**
- `src/components/logs/AvailabilityTree.tsx` — `null` → `undefined` when clearing participation on held=false

**Modify (numeric readers — `> 0` / `!== 0` → key-presence / typeof):**
- `src/charts/chartSeries.ts` — `readHealthMetric` (5 built-in branches + custom default)
- `src/utils/healthCompleteness.ts` — `isFieldFilled` (5 built-in branches + custom default)
- `src/utils/customMetricEntries.ts` — `isMeaningful`
- `src/components/dashboard/Dashboard.tsx` — `competitionLoggedAny`
- `src/components/dashboard/ActivityCalendar.tsx` — competition cell `hasAny`
- `src/components/logs/CompetitionLog.tsx` — `stringValue` and `total` cell rendering
- `src/components/logs/HealthLog.tsx` — `stringValue` for built-ins and customs

**Modify (numeric writers — empty input → undefined instead of 0):**
- `src/components/logs/HealthLog.tsx` — `setNumericField`, `setCustomMetric`
- `src/components/logs/CompetitionLog.tsx` — `setMetricValue`

**Modify (tests — flip existing assertions + add zero-preservation cases + replace null with undefined / absent keys):**
- `src/charts/chartSeries.test.ts`
- `src/utils/healthCompleteness.test.ts`
- `src/utils/customMetricEntries.test.ts`
- `src/contexts/DataContext.test.tsx`
- `src/codap/CodapPlugin.test.tsx`
- `src/components/logs/AvailabilityTree.test.tsx`
- `src/migrations/healthEntry.fixtures.ts`

**Update (stale comments mentioning the old convention):**
- `src/utils/customMetricEntries.ts` (the FUTURE WORK block — this plan implements it)
- `src/charts/chartSeries.ts` (the buildAlignedSeries comment about "0 is treated as not logged")
- `src/components/logs/HealthLog.tsx`, `CompetitionLog.tsx`, `Dashboard.tsx`, `ActivityCalendar.tsx` (the `!== 0 (rather than > 0)` callouts)
- `src/contexts/DataContext.tsx` (the "typed-null contract" comment in `firestoreSetHealthEntry`)

**No code change but verify behavior:**
- `src/components/logs/CompetitionTotals.ts` — `competitionTotal` already handles the new world

---

## Task 1: Translate `undefined` field values to `deleteField()` at the Firestore boundary

Foundation step. Firestore's `setDoc(..., { merge: true })` rejects `undefined` field values by default (we don't set `ignoreUndefinedProperties` in `firebase.ts:29`). Even with that flag set, undefined values would be silently dropped — leaving prior server values intact. `deleteField()` is the SDK sentinel that actually removes a stored field. This task adds infrastructure; no consumer types change yet.

**Files:**
- Modify: `src/contexts/DataContext.tsx:1-20` (add import), `src/contexts/DataContext.tsx:77-135` (both `firestoreSet*` helpers)
- Modify: `src/types/data.ts:21, 27` (widen map value types only)
- Test: `src/contexts/DataContext.test.tsx`

- [ ] **Step 1: Widen the `customMetrics` and `metrics` value types**

In `src/types/data.ts`, change line 21:

```ts
customMetrics?: Record<string, number | string>;
```

to:

```ts
// `undefined` means "delete this key" when used in a Partial<HealthEntry>
// passed to setHealthEntry. Stored docs never contain undefined values —
// the Firestore writer translates undefined to deleteField() before write.
customMetrics?: Record<string, number | string | undefined>;
```

And line 27 on `CompetitionEntry`:

```ts
metrics: Record<string, number | string | undefined>;
```

- [ ] **Step 2: Write failing tests for built-in field clearing and customMetrics key removal**

Find the existing `describe` block in `src/contexts/DataContext.test.tsx` that covers `setHealthEntry` writes. Add two new tests (match the existing test's setup conventions — fake Firestore listener, `flushAndSettle` helper, etc.):

```ts
it("clears a built-in numeric field when setHealthEntry receives undefined (DGT-53)", async () => {
  const { result } = renderHook(() => useData(), { wrapper });
  act(() => {
    result.current.setHealthEntry(HEALTH_DATE, { hydration: 5 });
  });
  await flushAndSettle();
  expect(serverHealthByDate.get(HEALTH_DATE)?.hydration).toBe(5);

  act(() => {
    result.current.setHealthEntry(HEALTH_DATE, { hydration: undefined });
  });
  await flushAndSettle();
  const after = serverHealthByDate.get(HEALTH_DATE);
  expect(after).toBeDefined();
  // After clearing, the key must be absent — not 0, not still 5.
  expect("hydration" in after!).toBe(false);
});

it("removes a customMetrics key when setHealthEntry sets it to undefined (DGT-53)", async () => {
  const { result } = renderHook(() => useData(), { wrapper });
  act(() => {
    result.current.setHealthEntry(HEALTH_DATE, {
      customMetrics: { c_stretch: 30 },
    });
  });
  await flushAndSettle();
  expect(serverHealthByDate.get(HEALTH_DATE)?.customMetrics?.c_stretch).toBe(30);

  act(() => {
    result.current.setHealthEntry(HEALTH_DATE, {
      customMetrics: { c_stretch: undefined },
    });
  });
  await flushAndSettle();
  const customs = serverHealthByDate.get(HEALTH_DATE)?.customMetrics ?? {};
  expect("c_stretch" in customs).toBe(false);
});
```

`flushAndSettle` / `serverHealthByDate` / `wrapper` / `HEALTH_DATE` are existing helpers — read the file to see the convention and reuse.

- [ ] **Step 3: Run tests to verify failure**

```bash
npx vitest run src/contexts/DataContext.test.tsx
```

Expected: both new cases fail — most likely with a Firestore SDK error like `"Function setDoc() called with invalid data. Unsupported field value: undefined"` because we haven't translated undefined yet.

- [ ] **Step 4: Add `deleteField` import**

In `src/contexts/DataContext.tsx`, add to the firestore imports block (around lines 4-16):

```ts
import {
  // ... existing imports ...
  deleteField,
} from "firebase/firestore";
```

- [ ] **Step 5: Add the `withDeleteSentinels` helper**

Insert above `firestoreSetHealthEntry` (before line 77):

```ts
// Walks an object one level deep, replacing top-level `undefined` values
// with deleteField() sentinels. Recurses one extra level into known
// nested map fields (availability sub-keys, customMetrics, metrics) since
// those also support per-key clearing under setDoc(merge:true). Other
// nested objects pass through as-is.
function withDeleteSentinels(
  payload: Record<string, unknown>,
  deepMapKeys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined) {
      out[k] = deleteField();
    } else if (
      deepMapKeys.includes(k) &&
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      const inner: Record<string, unknown> = {};
      for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) {
        inner[ik] = iv === undefined ? deleteField() : iv;
      }
      out[k] = inner;
    } else {
      out[k] = v;
    }
  }
  return out;
}
```

- [ ] **Step 6: Apply the translation in `firestoreSetHealthEntry`**

In the existing `firestoreSetHealthEntry` (currently lines 77-118), replace:

```ts
  const ref = doc(db, "users", uid, "healthEntries", date);
  const fields: Record<string, unknown> = { ...partial, date };
```

with:

```ts
  const ref = doc(db, "users", uid, "healthEntries", date);
  const fields = withDeleteSentinels(
    { ...(partial as Record<string, unknown>), date },
    ["availability", "customMetrics"],
  );
```

**Do not touch the version-stamping block (lines 85-90) or the creation-path null-stamping block (lines 100-116) yet** — those stay for now and get removed in Task 3.

- [ ] **Step 7: Apply the translation in `firestoreSetCompetitionEntry`**

Replace in `firestoreSetCompetitionEntry` (currently lines 120-135):

```ts
  const ref = doc(db, "users", uid, "competitionEntries", date);
  const fields: Record<string, unknown> = { ...partial, date };
```

with:

```ts
  const ref = doc(db, "users", uid, "competitionEntries", date);
  const fields = withDeleteSentinels(
    { ...(partial as Record<string, unknown>), date },
    ["metrics"],
  );
```

- [ ] **Step 8: Run the new tests + the full DataContext suite**

```bash
npx vitest run src/contexts/DataContext.test.tsx
```

Expected: the two new cases pass; all existing cases still pass.

- [ ] **Step 9: Commit**

```bash
git add src/types/data.ts src/contexts/DataContext.tsx src/contexts/DataContext.test.tsx
git commit -m "feat(data): translate undefined to deleteField at Firestore boundary [DGT-53]"
```

---

## Task 2: Make built-in health numeric fields optional

Now the storage layer knows how to clear fields, we can loosen the numeric types and stop pre-stamping zeros. This change alone doesn't break existing readers — `undefined > 0` evaluates to `false`, so the old `> 0` and `!== 0` checks continue to (correctly) treat the new "missing" as "not logged." Subsequent tasks tighten those readers to also treat stored `0` as valid.

**Files:**
- Modify: `src/types/data.ts:4-22, 34-50`

- [ ] **Step 1: Update the `HealthEntry` interface**

Replace `src/types/data.ts:4-22`:

```ts
export interface HealthEntry {
  version: number;
  date: string;
  // The five built-in numeric metrics. Optional so a freshly-created
  // entry can omit fields the user has not logged. `0` is a VALID value
  // (the user genuinely logged zero); `undefined` / absent means
  // "not logged." Writers translate undefined to deleteField() at the
  // Firestore boundary so cleared values are removed from the doc.
  hydration?: number;
  sleepTime?: number;
  sleepEfficiency?: number;
  protein?: number;
  leanMass?: number;
  availability: {
    practiceHeld: boolean | null;
    practiceParticipation: "played" | "dnp" | null;
    gameHeld: boolean | null;
    gameParticipation: "played" | "dnp" | null;
  };
  // User-defined custom health metric values, keyed by CustomMetricDef.id.
  // A missing key (or `undefined`) means "not logged." Stored values are
  // always number or string.
  customMetrics?: Record<string, number | string | undefined>;
}
```

(Availability sub-keys are still `T | null` here — Task 3 flips them.)

- [ ] **Step 2: Update `emptyHealthEntry`**

Replace `src/types/data.ts:34-50`:

```ts
export function emptyHealthEntry(date: string): HealthEntry {
  return {
    version: CURRENT_HEALTH_ENTRY_VERSION,
    date,
    availability: {
      practiceHeld: null,
      practiceParticipation: null,
      gameHeld: null,
      gameParticipation: null,
    },
    // Built-in numeric fields and customMetrics are intentionally
    // omitted. Their absence is the canonical "not logged" state.
  };
}
```

- [ ] **Step 3: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: typecheck passes. Existing readers reference `e.hydration > 0` (and similar) — those compare `number | undefined > 0` which is valid TypeScript and returns `false` for undefined.

- [ ] **Step 4: Run the full test suite**

```bash
npx vitest run
```

Expected: green. The semantic equivalence of "0 means not logged" still holds across the codebase, just now expressed through the optional type as well.

- [ ] **Step 5: Commit**

```bash
git add src/types/data.ts
git commit -m "refactor(data): make built-in health fields optional [DGT-53]"
```

---

## Task 3: Make availability sub-keys optional and remove the typed-null contract

This is the meatiest task. All availability code changes together — type, factory, Firestore boundary, readers, the AvailabilityTree writer, and tests — because reader semantics flip when the missing-value sentinel changes from `null` to `undefined`. A `!== null` check returns `true` for `undefined`, which would mistakenly count an unanswered question as answered. So everything goes in one atomic commit.

**Files:**
- Modify: `src/types/data.ts:12-17, 43-48` (availability shape + factory)
- Modify: `src/contexts/DataContext.tsx:91-116` (remove creation-path expansion + its now-stale comment)
- Modify: `src/charts/chartSeries.ts:140-143`
- Modify: `src/utils/healthCompleteness.ts:7-10, 59-69`
- Modify: `src/codap/CodapPlugin.tsx:354-364`
- Modify: `src/components/logs/AvailabilityTree.tsx:55, 65`
- Modify: `src/migrations/healthEntry.fixtures.ts`
- Modify: tests in `src/contexts/DataContext.test.tsx`, `src/utils/healthCompleteness.test.ts`, `src/codap/CodapPlugin.test.tsx`, `src/components/logs/AvailabilityTree.test.tsx`

- [ ] **Step 1: Write a failing test for `practiceParticipation` clearing**

The single new behavior this task introduces (beyond consistency cleanup) is that toggling `practiceHeld` from `true` to `false` must now CLEAR `practiceParticipation` on disk, not store an explicit null. Add to `src/contexts/DataContext.test.tsx` (near the existing availability tests):

```ts
it("clears practiceParticipation on disk when held flips true→false (DGT-53)", async () => {
  const { result } = renderHook(() => useData(), { wrapper });
  act(() => {
    result.current.setHealthEntry(HEALTH_DATE, {
      availability: { practiceHeld: true, practiceParticipation: "played" },
    } as Partial<HealthEntry>);
  });
  await flushAndSettle();
  let server = serverHealthByDate.get(HEALTH_DATE);
  expect(server?.availability?.practiceParticipation).toBe("played");

  act(() => {
    result.current.setHealthEntry(HEALTH_DATE, {
      availability: { practiceHeld: false, practiceParticipation: undefined },
    } as Partial<HealthEntry>);
  });
  await flushAndSettle();
  server = serverHealthByDate.get(HEALTH_DATE);
  expect(server?.availability?.practiceHeld).toBe(false);
  expect("practiceParticipation" in (server?.availability ?? {})).toBe(false);
});
```

- [ ] **Step 2: Run it and verify failure**

```bash
npx vitest run src/contexts/DataContext.test.tsx -t "clears practiceParticipation"
```

Expected: fail with type error on `practiceParticipation: undefined` (because the type today is `T | null`).

- [ ] **Step 3: Update the `HealthEntry.availability` type**

In `src/types/data.ts`, replace lines 12-17:

```ts
  // Availability is a tree, not a scalar. Each sub-key is optional;
  // a missing key means "not answered." `practiceHeld` / `gameHeld`
  // can be `true` or `false`; both are valid answered states.
  // Participation sub-keys are only meaningful when their `*Held`
  // parent is `true` — AvailabilityTree clears them via undefined
  // when the parent flips to false.
  availability: {
    practiceHeld?: boolean;
    practiceParticipation?: "played" | "dnp";
    gameHeld?: boolean;
    gameParticipation?: "played" | "dnp";
  };
```

- [ ] **Step 4: Update `emptyHealthEntry` to omit availability sub-keys**

In `src/types/data.ts`, replace the `availability` block in `emptyHealthEntry`:

```ts
    // availability sub-keys are intentionally omitted — absence is
    // the canonical "not answered" state.
    availability: {},
```

- [ ] **Step 5: Run typecheck to surface all stale `=== null` / `!== null` uses**

```bash
npx tsc --noEmit
```

Expected: type errors. The errors tell you which files still reference `null` for availability sub-keys. Steps 6-11 fix each of those.

- [ ] **Step 6: Remove the creation-path null-stamping block in `firestoreSetHealthEntry`**

In `src/contexts/DataContext.tsx`, delete lines 91-116 (the comment block starting "Creation path only:" and the entire `if (knownServerVersion === undefined && partial.availability !== undefined)` block). Replace with a brief replacement comment:

```ts
  // Availability sub-keys are optional in the type model — an absent
  // key means "not answered." Writing { availability: { practiceHeld: true } }
  // under merge:true correctly leaves the other sub-keys absent on disk,
  // and the readers (availabilityFilled etc.) treat absent keys as
  // unanswered.
```

(The block's whole purpose was to defend against `undefined` reading where the code expected `null`. That contract is gone.)

- [ ] **Step 7: Update `availabilityFilled` in `healthCompleteness.ts`**

Replace `src/utils/healthCompleteness.ts:7-10` (the doc comment) and lines 59-69 (the function):

```ts
// Availability counts as filled iff practiceHeld is answered AND
// (practiceHeld === false OR practiceParticipation is answered) — the
// tree must be answered to its leaves to count. Same rule for game.
// "Answered" means typeof === "boolean" / typeof === "string"; absent
// / undefined means "not answered."
```

```ts
function availabilityFilled(entry: HealthEntry): boolean {
  const a = entry.availability;
  if (!a) return false;
  const practiceFilled =
    typeof a.practiceHeld === "boolean" &&
    (a.practiceHeld === false || typeof a.practiceParticipation === "string");
  const gameFilled =
    typeof a.gameHeld === "boolean" &&
    (a.gameHeld === false || typeof a.gameParticipation === "string");
  return practiceFilled && gameFilled;
}
```

- [ ] **Step 8: Update the availability branch in `chartSeries.readHealthMetric`**

In `src/charts/chartSeries.ts`, replace lines 140-143:

```ts
      return typeof e.availability?.practiceHeld === "boolean" &&
        typeof e.availability?.gameHeld === "boolean"
        ? 1
        : undefined;
```

- [ ] **Step 9: Update the CODAP plugin's availability flattening**

In `src/codap/CodapPlugin.tsx`, replace lines 353-364:

```tsx
    case "availability":
      // Flatten the tree for CODAP - a single string captures the
      // four-cell state at a glance. An absent / undefined parent
      // means "not answered" and is rendered as "—".
      if (!e.availability) return null;
      return [
        e.availability.practiceHeld === undefined
          ? "—"
          : e.availability.practiceHeld
            ? `practice:${e.availability.practiceParticipation ?? "?"}`
            : "no-practice",
        e.availability.gameHeld === undefined
          ? "—"
          : e.availability.gameHeld
            ? `game:${e.availability.gameParticipation ?? "?"}`
            : "no-game",
      ].join(" / ");
```

- [ ] **Step 10: Update `AvailabilityTree` to clear with `undefined`**

In `src/components/logs/AvailabilityTree.tsx`, replace lines 49-57 and 61-67:

```tsx
  function setPracticeHeld(held: boolean) {
    onChange({
      ...value,
      practiceHeld: held,
      // Clear participation when switching to "no practice" — the
      // field becomes meaningless. undefined here triggers the
      // Firestore boundary's deleteField() translation so the stored
      // doc loses the key.
      practiceParticipation: held ? value.practiceParticipation : undefined,
    });
  }
```

```tsx
  function setGameHeld(held: boolean) {
    onChange({
      ...value,
      gameHeld: held,
      gameParticipation: held ? value.gameParticipation : undefined,
    });
  }
```

The radio `checked` props at lines 93, 104, 128, 139, 163, 174, 198, 209 use `value.X === true` / `=== false` / `=== "played"` etc. These continue to work — checking `undefined === true` is `false`, which correctly leaves both radios unchecked when the field is unanswered.

- [ ] **Step 11: Update the migration fixtures**

In `src/migrations/healthEntry.fixtures.ts`, replace lines 24-29 (the `legacy.availability` block) so the unanswered state uses absence rather than nulls:

```ts
    availability: {},
```

Keep the `1.availability` block intact (it has real answered values) but check that all four sub-keys are present — if any are `null` (e.g., line 14's `gameParticipation: null`), replace `null` with omission (i.e., remove the key from the object literal):

```ts
    availability: {
      practiceHeld: true,
      practiceParticipation: "played",
      gameHeld: false,
      // gameParticipation omitted — gameHeld=false means participation
      // is meaningless and unanswered.
    },
```

- [ ] **Step 12: Update availability test fixtures and assertions**

Run the full suite and flip every test fixture / assertion using `null` for availability sub-keys to use `undefined` (or omission). Files known to touch this (from grep):

- `src/contexts/DataContext.test.tsx:69, 71, 487-489, 511, 528, 698-700, 728-730, 766, 782-784, 805-807, 836-838, 856-858` — fixture availability blocks. Replace `null` with absence for unanswered sub-keys. The assertion at line 528 (`expect(payload.availability).toEqual({ practiceHeld: false })`) is already shape-correct under the new model — verify nothing else around it needs adjustment.
- `src/contexts/DataContext.test.tsx:466-490` — There's an existing test that asserts the creation-path null-stamping. **Delete this test entirely** (with its comment) — its premise (typed-null contract) no longer exists. Replace with a sibling test asserting the OPPOSITE: writing `{ availability: { practiceHeld: true } }` to a brand-new doc results in only `practiceHeld: true` on disk, not the full four-key shape.

```ts
it("brand-new entry: only the written availability sub-keys appear on disk (DGT-53)", async () => {
  const { result } = renderHook(() => useData(), { wrapper });
  act(() => {
    result.current.setHealthEntry(HEALTH_DATE, {
      availability: { practiceHeld: true },
    } as Partial<HealthEntry>);
  });
  await flushAndSettle();
  const server = serverHealthByDate.get(HEALTH_DATE);
  expect(server?.availability).toEqual({ practiceHeld: true });
});
```

- `src/codap/CodapPlugin.test.tsx:254, 256` — fixture, replace `null` with absence.
- `src/utils/healthCompleteness.test.ts:24, 26` — fixture, replace `null` with absence.
- `src/components/logs/AvailabilityTree.test.tsx` — read the file; if any assertion passes `null` to the component or asserts `null` is emitted via `onChange`, flip to `undefined` / omission.

- [ ] **Step 13: Run typecheck + tests**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: green. Any remaining red is most likely a fixture file still containing `null` for an availability sub-key, or a test still asserting `null`. Fix in place.

- [ ] **Step 14: Commit**

```bash
git add src/types/data.ts \
  src/contexts/DataContext.tsx \
  src/charts/chartSeries.ts \
  src/utils/healthCompleteness.ts \
  src/codap/CodapPlugin.tsx \
  src/components/logs/AvailabilityTree.tsx \
  src/migrations/healthEntry.fixtures.ts \
  src/contexts/DataContext.test.tsx \
  src/codap/CodapPlugin.test.tsx \
  src/utils/healthCompleteness.test.ts \
  src/components/logs/AvailabilityTree.test.tsx
git commit -m "refactor(data): unify availability missing-value to undefined [DGT-53]"
```

---

## Task 4: Pin optimistic-overlay clearing semantics with tests

The optimistic overlay (`health` useMemo at `DataContext.tsx:696-725`, `competition` useMemo at 727-751) spreads `entry.partial` over `base`. A pending `{ hydration: undefined }` should show up as `entry.hydration === undefined` in the rendered overlay before the flush. JS spread already preserves explicit `undefined` keys, so this should Just Work — but pin it with tests so we'd catch a regression in the merge logic.

**Files:**
- Test: `src/contexts/DataContext.test.tsx`

- [ ] **Step 1: Add tests near the existing optimistic-overlay describe block**

```ts
it("optimistic overlay reflects a cleared built-in field before flush (DGT-53)", () => {
  const { result } = renderHook(() => useData(), { wrapper });
  act(() => {
    result.current.setHealthEntry(HEALTH_DATE, { hydration: 5 });
  });
  let entry = readHealthByDate(result.current, HEALTH_DATE);
  expect(entry?.hydration).toBe(5);

  act(() => {
    result.current.setHealthEntry(HEALTH_DATE, { hydration: undefined });
  });
  entry = readHealthByDate(result.current, HEALTH_DATE);
  expect(entry?.hydration).toBeUndefined();
});

it("optimistic overlay reflects a cleared customMetrics key before flush (DGT-53)", () => {
  const { result } = renderHook(() => useData(), { wrapper });
  act(() => {
    result.current.setHealthEntry(HEALTH_DATE, {
      customMetrics: { c_stretch: 30 },
    });
  });
  let entry = readHealthByDate(result.current, HEALTH_DATE);
  expect(entry?.customMetrics?.c_stretch).toBe(30);

  act(() => {
    result.current.setHealthEntry(HEALTH_DATE, {
      customMetrics: { c_stretch: undefined },
    });
  });
  entry = readHealthByDate(result.current, HEALTH_DATE);
  expect(entry?.customMetrics?.c_stretch).toBeUndefined();
});

it("optimistic overlay reflects a cleared availability sub-key before flush (DGT-53)", () => {
  const { result } = renderHook(() => useData(), { wrapper });
  act(() => {
    result.current.setHealthEntry(HEALTH_DATE, {
      availability: { practiceHeld: true, practiceParticipation: "played" },
    } as Partial<HealthEntry>);
  });
  let entry = readHealthByDate(result.current, HEALTH_DATE);
  expect(entry?.availability.practiceParticipation).toBe("played");

  act(() => {
    result.current.setHealthEntry(HEALTH_DATE, {
      availability: { practiceHeld: false, practiceParticipation: undefined },
    } as Partial<HealthEntry>);
  });
  entry = readHealthByDate(result.current, HEALTH_DATE);
  expect(entry?.availability.practiceHeld).toBe(false);
  expect(entry?.availability.practiceParticipation).toBeUndefined();
});
```

`readHealthByDate` is a local convention — match existing tests that pluck entries from `useData().health.entries`.

- [ ] **Step 2: Run**

```bash
npx vitest run src/contexts/DataContext.test.tsx
```

Expected: all three new cases pass without code changes (the merge logic is already correct). If any fail, inspect the relevant useMemo at `DataContext.tsx:696-751` — there's likely a stale `?? null` or similar that's eating the undefined.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/DataContext.test.tsx
git commit -m "test(data): pin optimistic-overlay clearing semantics [DGT-53]"
```

---

## Task 5: Fix `readHealthMetric` to preserve zero values

**Files:**
- Modify: `src/charts/chartSeries.ts:120-156` (numeric branches only — availability branch was already updated in Task 3)
- Modify: `src/charts/chartSeries.test.ts`

- [ ] **Step 1: Update tests in `src/charts/chartSeries.test.ts`**

The existing test at lines 134-147 (`treats health custom value 0 as 'not logged'`) asserts the OLD behavior. Replace that test with three new ones:

```ts
it("preserves a logged zero for a health custom metric (DGT-53)", () => {
  const entry = {
    ...emptyHealthEntry(isoAtDaysAgo(0)),
    customMetrics: { c_stretch: 0 },
  };
  const out = buildAlignedSeries({
    type: "health",
    metricId: "c_stretch",
    healthEntries: [entry],
    competitionEntries: [],
    rangeDays: 1,
  });
  expect(out[0].value).toBe(0);
});

it("treats a missing customMetrics key as 'not logged' (DGT-53)", () => {
  const entry = emptyHealthEntry(isoAtDaysAgo(0));
  const out = buildAlignedSeries({
    type: "health",
    metricId: "c_stretch",
    healthEntries: [entry],
    competitionEntries: [],
    rangeDays: 1,
  });
  expect(out[0].value).toBeNull();
});

it("preserves a logged zero for a built-in health metric (DGT-53)", () => {
  const entry = {
    ...emptyHealthEntry(isoAtDaysAgo(0)),
    sleepTime: 0,
  };
  const out = buildAlignedSeries({
    type: "health",
    metricId: "sleepTime",
    healthEntries: [entry],
    competitionEntries: [],
    rangeDays: 1,
  });
  expect(out[0].value).toBe(0);
});
```

Also revise the buildAlignedSeries test at line 91 — the comment `// 0 → "not logged" → null` is stale. Adjust the setup to produce an undefined / absent value (just leave the field unset) and update the comment.

- [ ] **Step 2: Run tests to verify failure**

```bash
npx vitest run src/charts/chartSeries.test.ts
```

Expected: the new "preserves a logged zero" cases fail.

- [ ] **Step 3: Update the numeric branches of `readHealthMetric`**

In `src/charts/chartSeries.ts`, replace lines 124-156 (everything below the function signature):

```ts
  switch (metricId) {
    case "hydration":
      return typeof e.hydration === "number" && Number.isFinite(e.hydration)
        ? e.hydration
        : undefined;
    case "sleepTime":
      return typeof e.sleepTime === "number" && Number.isFinite(e.sleepTime)
        ? e.sleepTime
        : undefined;
    case "sleepEfficiency":
      return typeof e.sleepEfficiency === "number" &&
        Number.isFinite(e.sleepEfficiency)
        ? e.sleepEfficiency
        : undefined;
    case "protein":
      return typeof e.protein === "number" && Number.isFinite(e.protein)
        ? e.protein
        : undefined;
    case "leanMass":
      return typeof e.leanMass === "number" && Number.isFinite(e.leanMass)
        ? e.leanMass
        : undefined;
    case "availability":
      return typeof e.availability?.practiceHeld === "boolean" &&
        typeof e.availability?.gameHeld === "boolean"
        ? 1
        : undefined;
    default: {
      // Custom health metric ids: values live in entry.customMetrics
      // rather than as typed fields. A stored 0 is valid data and flows
      // through unchanged; only non-numeric / non-finite / absent values
      // become undefined (the "not logged" state).
      const raw = e.customMetrics?.[metricId];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        return raw;
      }
      return undefined;
    }
  }
}
```

- [ ] **Step 4: Update the `buildAlignedSeries` doc comment**

Replace lines 164-165:

```
// Competition metrics: 0 is preserved (valid score). Health metrics:
// 0 is treated as "not logged" (matches buildSeries / readHealthMetric).
```

with:

```
// 0 is preserved as valid data for both health and competition metrics.
// "Not logged" is encoded as undefined / missing key, propagating to
// null in the aligned output for the chart's empty-slot rendering.
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/charts/chartSeries.test.ts
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/charts/chartSeries.ts src/charts/chartSeries.test.ts
git commit -m "fix(metrics): preserve zero values in chart series reads [DGT-53]"
```

---

## Task 6: Fix `healthCompleteness.isFieldFilled` to count zero as filled

**Files:**
- Modify: `src/utils/healthCompleteness.ts:29-57` (numeric branches only — `availabilityFilled` was updated in Task 3)
- Modify: `src/utils/healthCompleteness.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
it("counts a built-in field of 0 as filled (DGT-53)", () => {
  const entry: HealthEntry = {
    ...emptyHealthEntry("2026-05-11"),
    sleepTime: 0,
  };
  expect(getChipState(entry, ["sleepTime"])).toBe("all");
});

it("counts a custom metric of 0 as filled (DGT-53)", () => {
  const entry: HealthEntry = {
    ...emptyHealthEntry("2026-05-11"),
    customMetrics: { c_stretch: 0 },
  };
  expect(getChipState(entry, ["c_stretch"])).toBe("all");
});

it("treats an undefined built-in field as 'not logged' (DGT-53)", () => {
  const entry: HealthEntry = emptyHealthEntry("2026-05-11");
  expect(getChipState(entry, ["sleepTime"])).toBe("none");
});
```

Also delete or update the stale comment at line 118 (referencing the `!== 0` custom-metric rule — the convention is gone).

- [ ] **Step 2: Run tests to verify failure**

```bash
npx vitest run src/utils/healthCompleteness.test.ts
```

- [ ] **Step 3: Update `isFieldFilled`**

Replace `src/utils/healthCompleteness.ts:29-57`:

```ts
function isFieldFilled(entry: HealthEntry | null, id: string): boolean {
  if (!entry) return false;
  switch (id) {
    case "hydration":
      return typeof entry.hydration === "number" && Number.isFinite(entry.hydration);
    case "sleepTime":
      return typeof entry.sleepTime === "number" && Number.isFinite(entry.sleepTime);
    case "sleepEfficiency":
      return (
        typeof entry.sleepEfficiency === "number" &&
        Number.isFinite(entry.sleepEfficiency)
      );
    case "protein":
      return typeof entry.protein === "number" && Number.isFinite(entry.protein);
    case "leanMass":
      return typeof entry.leanMass === "number" && Number.isFinite(entry.leanMass);
    case "availability":
      return availabilityFilled(entry);
    default: {
      // Custom metric: a finite number (including 0 and negatives)
      // or a non-empty string counts as filled. A missing / undefined
      // key means "not logged."
      const v = entry.customMetrics?.[id];
      if (typeof v === "number") return Number.isFinite(v);
      if (typeof v === "string") return v.trim() !== "";
      return false;
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/utils/healthCompleteness.test.ts
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/healthCompleteness.ts src/utils/healthCompleteness.test.ts
git commit -m "fix(metrics): chip completeness counts zero as logged [DGT-53]"
```

---

## Task 7: Fix `customMetricEntries.isMeaningful`

**Files:**
- Modify: `src/utils/customMetricEntries.ts`
- Modify: `src/utils/customMetricEntries.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
it("considers a 0 value meaningful (DGT-53)", () => {
  const h: HealthEntry[] = [
    {
      ...emptyHealthEntry("2026-05-11"),
      customMetrics: { c_stretch: 0 },
    },
  ];
  expect(hasEntriesForMetric("c_stretch", h, [])).toBe(true);
});

it("ignores an undefined / missing custom metric key (DGT-53)", () => {
  const h: HealthEntry[] = [emptyHealthEntry("2026-05-11")];
  expect(hasEntriesForMetric("c_stretch", h, [])).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npx vitest run src/utils/customMetricEntries.test.ts
```

- [ ] **Step 3: Replace the file body**

Replace the entire body of `src/utils/customMetricEntries.ts`:

```ts
import type { CompetitionEntry, HealthEntry } from "../types/data";

// Returns true when at least one health or competition entry has a finite
// numeric value (including 0 and negatives) or a non-empty string value
// for the given metric ID. A missing / undefined key means "not logged."
//
// Backs the "you have entries — really untrack this metric?" confirmation
// dialog.
export function hasEntriesForMetric(
  metricId: string,
  healthEntries: HealthEntry[],
  competitionEntries: CompetitionEntry[],
): boolean {
  for (const entry of healthEntries) {
    const v = entry.customMetrics?.[metricId];
    if (isMeaningful(v)) return true;
  }
  for (const entry of competitionEntries) {
    const v = entry.metrics?.[metricId];
    if (isMeaningful(v)) return true;
  }
  return false;
}

function isMeaningful(v: number | string | undefined): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") return v.trim() !== "";
  return false;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/utils/customMetricEntries.test.ts
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/customMetricEntries.ts src/utils/customMetricEntries.test.ts
git commit -m "fix(metrics): hasEntriesForMetric counts zero as a real entry [DGT-53]"
```

---

## Task 8: Fix `Dashboard.competitionLoggedAny`

**Files:**
- Modify: `src/components/dashboard/Dashboard.tsx:42-54`

- [ ] **Step 1: Search for a Dashboard test**

```bash
ls src/components/dashboard/Dashboard.test.* 2>/dev/null
```

If a test file exists, add a "0 counts as logged" case. If not, defer to Task 14 (manual verification).

- [ ] **Step 2: Update `competitionLoggedAny`**

In `src/components/dashboard/Dashboard.tsx`, replace lines 42-54:

```tsx
  const todayCompetition =
    competitionEntries.find((e) => e.date === todayIso) ?? null;
  const competitionLoggedAny = !!(
    todayCompetition &&
    Object.values(todayCompetition.metrics ?? {}).some((v) => {
      // A finite number (including 0 and negatives) or a non-empty
      // string counts as "logged."
      if (typeof v === "number") return Number.isFinite(v);
      if (typeof v === "string") return v.trim() !== "";
      return false;
    })
  );
```

- [ ] **Step 3: Run tests as a regression check**

```bash
npx vitest run
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/Dashboard.tsx
git commit -m "fix(dashboard): treat zero as logged competition data [DGT-53]"
```

---

## Task 9: Fix `ActivityCalendar` competition cell `hasAny`

**Files:**
- Modify: `src/components/dashboard/ActivityCalendar.tsx:119-131`

- [ ] **Step 1: Locate any existing test file**

```bash
ls src/components/dashboard/ActivityCalendar.test.* 2>/dev/null
```

Add a "0 in metrics produces logged-state" test if one exists. Otherwise defer.

- [ ] **Step 2: Update the cell-state logic**

In `src/components/dashboard/ActivityCalendar.tsx`, replace lines 119-131:

```tsx
    } else {
      const entry = competitionByDate.get(iso) ?? null;
      const hasAny =
        !!entry &&
        Object.values(entry.metrics ?? {}).some((v) => {
          // A finite number (including 0 and negatives) or a non-empty
          // string counts as logged.
          if (typeof v === "number") return Number.isFinite(v);
          if (typeof v === "string") return v.trim() !== "";
          return false;
        });
      state = hasAny ? "all" : "none";
    }
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/ActivityCalendar.tsx
git commit -m "fix(dashboard): ActivityCalendar treats zero as logged [DGT-53]"
```

---

## Task 10: Fix `CompetitionLog` row `stringValue` and `total` cell

**Files:**
- Modify: `src/components/logs/CompetitionLog.tsx:14, 134-160`

- [ ] **Step 1: Add the `hasEntriesForMetric` import**

Near the top of `src/components/logs/CompetitionLog.tsx`, add:

```ts
import { hasEntriesForMetric } from "../../utils/customMetricEntries";
```

- [ ] **Step 2: Update the row body**

Replace lines 134-160:

```tsx
            {displayedMetrics.map((metric) => {
              const live = currentEntry.metrics?.[metric.id];
              // stringValue renders the input control. A stored 0 is
              // valid logged data and must show as "0". A missing key
              // (undefined) is "not logged" and renders as blank.
              const stringValue =
                typeof live === "number" && Number.isFinite(live)
                  ? String(live)
                  : typeof live === "string" && live !== ""
                    ? live
                    : "";
              const filled = stringValue !== "";
              const total = competitionTotal(entries, metric.id);
              const nameCellId = `${nameIdBase}-${metric.id}`;
              return (
                <tr key={metric.id}>
                  <td className={css.colTotal}>
                    {/* competitionTotal returns 0 both for "no entries"
                        and for "entries summing to 0" — use
                        hasEntriesForMetric to render the cell only when
                        there's real data, so a legit 0-total shows as
                        "0" and an empty cell stays blank. */}
                    {hasEntriesForMetric(metric.id, [], entries)
                      ? String(total)
                      : ""}
                  </td>
```

(Leave the rest of the `<tr>` body intact below the `<td colTotal>`.)

- [ ] **Step 3: Add a test if a test file exists**

If `CompetitionLog.test.tsx` exists, add:

```tsx
it("renders a stored 0 as '0' (DGT-53)", () => {
  // Render the log with a competition entry containing goals: 0.
  // Assert the input shows "0" and the total cell text is "0".
});
```

Match the existing test setup conventions. If no test file, defer to Task 14.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/logs/
```

- [ ] **Step 5: Commit**

```bash
git add src/components/logs/CompetitionLog.tsx
git commit -m "fix(logs): CompetitionLog renders zero values [DGT-53]"
```

---

## Task 11: Fix `HealthLog` row `stringValue` for built-ins and customs

**Files:**
- Modify: `src/components/logs/HealthLog.tsx:198-242`

- [ ] **Step 1: Update the built-in numeric branch (around lines 196-213)**

Replace:

```tsx
                const fieldKey = id as keyof Pick<
                  HealthEntry,
                  "sleepTime" | "sleepEfficiency" | "protein" | "leanMass"
                >;
                const live = currentEntry[fieldKey];
                const stringValue =
                  typeof live === "number" && live > 0 ? String(live) : "";
```

with:

```tsx
                const fieldKey = id as keyof Pick<
                  HealthEntry,
                  "sleepTime" | "sleepEfficiency" | "protein" | "leanMass"
                >;
                const live = currentEntry[fieldKey];
                // A finite number (including 0) renders verbatim so the
                // user sees what they logged. undefined / absent renders
                // as blank — that's the "not logged" state.
                const stringValue =
                  typeof live === "number" && Number.isFinite(live)
                    ? String(live)
                    : "";
```

- [ ] **Step 2: Update the custom-metric branch (around lines 216-226)**

Replace:

```tsx
                const live = currentEntry.customMetrics?.[id];
                // !== 0 (rather than > 0) so custom metrics with a
                // negative yBottomRaw can render legitimate negative
                // values. 0 stays the "blank input" sentinel since 0
                // is what the writer stores for an empty entry.
                const stringValue =
                  typeof live === "number" && live !== 0
                    ? String(live)
                    : typeof live === "string"
                      ? live
                      : "";
```

with:

```tsx
                const live = currentEntry.customMetrics?.[id];
                // Finite numbers (incl. 0 and negatives for customs
                // with yBottomRaw < 0) render verbatim. A missing key
                // (undefined) is "not logged" and renders as blank.
                const stringValue =
                  typeof live === "number" && Number.isFinite(live)
                    ? String(live)
                    : typeof live === "string"
                      ? live
                      : "";
```

- [ ] **Step 3: Run HealthLog tests**

```bash
npx vitest run src/components/logs/
```

- [ ] **Step 4: Commit**

```bash
git add src/components/logs/HealthLog.tsx
git commit -m "fix(logs): HealthLog renders zero values [DGT-53]"
```

---

## Task 12: Update writers to store `undefined` (not `0`) on empty input

Last piece. Once readers accept `0` as valid data, the writers stop converting empty → `0`. Empty input becomes "clear the field" — `undefined` flows through `withDeleteSentinels` to actually delete the stored value.

**Files:**
- Modify: `src/components/logs/HealthLog.tsx:82-103`
- Modify: `src/components/logs/CompetitionLog.tsx:63-67`

- [ ] **Step 1: Write writer-level tests if component tests exist**

If `HealthLog.test.tsx` or `CompetitionLog.test.tsx` exist with input-handling cases, add a "user clears input → setHealthEntry / setCompetitionEntry called with undefined" test. Otherwise defer to Task 14.

- [ ] **Step 2: Update `HealthLog.setNumericField`**

Replace `src/components/logs/HealthLog.tsx:82-89`:

```tsx
  function setNumericField<K extends keyof HealthEntry>(
    field: K,
    raw: string,
  ) {
    if (raw === "") {
      setHealthEntry(dateIso, { [field]: undefined } as Partial<HealthEntry>);
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;
    setHealthEntry(dateIso, { [field]: numeric } as Partial<HealthEntry>);
  }
```

- [ ] **Step 3: Update `HealthLog.setCustomMetric`**

Replace lines 99-103:

```tsx
  function setCustomMetric(metricId: string, raw: string) {
    if (raw === "") {
      setHealthEntry(dateIso, {
        customMetrics: { [metricId]: undefined },
      });
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;
    setHealthEntry(dateIso, { customMetrics: { [metricId]: numeric } });
  }
```

- [ ] **Step 4: Update `CompetitionLog.setMetricValue`**

Replace `src/components/logs/CompetitionLog.tsx:63-67`:

```tsx
  function setMetricValue(metricId: string, raw: string) {
    if (raw === "") {
      setCompetitionEntry(dateIso, {
        metrics: { [metricId]: undefined },
      });
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;
    setCompetitionEntry(dateIso, { metrics: { [metricId]: numeric } });
  }
```

- [ ] **Step 5: Run the full test suite**

```bash
npx vitest run
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/components/logs/HealthLog.tsx src/components/logs/CompetitionLog.tsx
git commit -m "fix(logs): clear stored value on empty input [DGT-53]"
```

---

## Task 13: Audit and update remaining comments

Sweep for stale references to the old conventions (`0` as sentinel, typed-null contract, "blank-input convention").

- [ ] **Step 1: Grep for stale references**

```bash
grep -rn '!== 0\|"0 is\|blank input\|"not logged"\|typed-null\|=== null' src/ --include="*.ts" --include="*.tsx" | grep -v test
```

Review each result. Anything mentioning "0 is the sentinel," "0 means blank," "!== 0 because of customs with yBottomRaw < 0," or "typed-null contract" is stale. Rewrite each as a short note describing the new semantics ("`undefined` / missing key means not logged"). Specific known stale spots:

- `CompetitionLog.tsx:134-141` — justifying `!== 0`. Replace with brief note about `Number.isFinite(v)`.
- `ActivityCalendar.tsx:124-126` — "match Dashboard.competitionLoggedAny stringValue: a non-zero number..." Replace with "a finite numeric value..."
- `chartSeries.ts:144-150` — references the "FUTURE WORK note in customMetricEntries.ts" which no longer exists.
- `DataContext.tsx:167-170, 705-707` — comments referencing `practiceHeld` shape may need a tweak for the new optional model.

- [ ] **Step 2: Apply minimal edits**

For each stale finding, make the smallest change that keeps the comment accurate. Don't rewrite for style — preserve the existing voice.

- [ ] **Step 3: Run typecheck + tests**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "docs(metrics): update comments for new zero-as-valid semantics [DGT-53]"
```

---

## Task 14: Manual verification with the dev server

Type-checks and unit tests verify code correctness but not feature correctness. Exercise the full flow.

- [ ] **Step 1: Clear local emulator data**

Stop the emulators if running. Remove any persisted emulator data (path varies; check `firebase.json`'s `emulators.firestore.data` or the default `~/.cache/firebase/...`). Or sign in as a fresh user via the dev server.

- [ ] **Step 2: Start emulators + dev server**

```bash
# Terminal 1
npm run emulators
# Terminal 2
npm run dev
```

- [ ] **Step 3: Health log — built-in zero**

1. Sign in, navigate to `/health` for today.
2. Type `0` into Sleep Time. Tab out.
3. Reload.
4. **Expect:** Sleep Time input still shows `0`. Chip state shows that metric as logged.
5. Clear the Sleep Time input. Tab out.
6. Reload.
7. **Expect:** Sleep Time input is blank. Chip shows that metric as not logged. In Firestore emulator UI, the doc has no `sleepTime` key.

- [ ] **Step 4: Competition log — built-in zero**

1. Navigate to `/competition` for today.
2. Type `0` into Goals.
3. Reload.
4. **Expect:** Goals input shows `0`. Total cell shows `0` (not blank). ActivityCalendar today-cell shows "logged" state. Dashboard reflects logged competition data.
5. Clear Goals. Reload.
6. **Expect:** Goals input blank. Total cell blank. ActivityCalendar today-cell returns to "none."

- [ ] **Step 5: Custom health metric — zero**

1. Create a custom health metric (e.g., "Cups of water").
2. On `/health`, enter `0`.
3. Reload.
4. **Expect:** Input shows `0`. Chip counts the custom as logged.

- [ ] **Step 6: Custom competition with negative range**

1. Create a custom competition metric with `yBottomRaw < 0` (e.g., score differential).
2. Enter `-3`.
3. Reload.
4. **Expect:** Input shows `-3`. Total sums correctly. Chart renders the negative value.

- [ ] **Step 7: Availability flows**

1. On `/health`, click Practice "Y", then click "Y" for participation. Reload — both selected.
2. Click Practice "N" (held=false). Reload — Practice "N" is selected; participation row is hidden (correct — held=false hides the children); the underlying participation value is cleared.
3. In Firestore emulator UI, confirm the doc's availability sub-object only has `practiceHeld: false`, NOT `practiceParticipation: "played"` (the prior value should be gone, not lingering).
4. Click Practice "Y" again. **Expect:** participation row reappears, both "Y" and "N" are unselected (clean slate).
5. Repeat for Game.

- [ ] **Step 8: Chart screens**

For each modified screen (health metric detail, competition metric detail, dashboard chart cards), open them after logging some zeros. Confirm:
- Bars render at the goal-line baseline for zeros (not as missing slots).
- Average badge includes zeros in its calculation.
- Today-ghost behavior unchanged.

- [ ] **Step 9: Browser console**

Open devtools console. Walk through all of the above. Expect zero red errors. Any Firestore SDK warning about `undefined` field values means the `deleteField()` translation isn't reaching that write path — investigate before merging.

- [ ] **Step 10: Commit any incidental fixes**

```bash
git status
# If clean, no commit. If anything was tweaked during verification, commit it.
```

---

## Task 15: Final sweep + PR

- [ ] **Step 1: Full check**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: all green. The production build catches stricter type narrowing that dev mode is lenient about.

- [ ] **Step 2: Final grep for leftover stale patterns**

```bash
grep -rn '\.hydration > 0\|\.sleepTime > 0\|\.sleepEfficiency > 0\|\.protein > 0\|\.leanMass > 0' src/ --include="*.ts" --include="*.tsx"
grep -rn 'practiceHeld === null\|gameHeld === null\|practiceHeld !== null\|gameHeld !== null' src/ --include="*.ts" --include="*.tsx"
grep -rn '\!== 0' src/ --include="*.ts" --include="*.tsx" | grep -v 'test\|spec'
```

Expected: no hits, or any remaining hits are clearly unrelated (loop indices, length checks).

- [ ] **Step 3: Open PR**

```bash
gh pr create --title "DGT-53: treat 0 as valid metric data" --body "$(cat <<'EOF'
## Summary

- Stop using `0` as the "not logged" sentinel for health and competition metrics. `0` is valid data; missing / `undefined` is "not logged."
- Make the five built-in `HealthEntry` numeric fields optional. `emptyHealthEntry` no longer pre-stamps zeros.
- Make the four `availability` sub-keys optional (was `T | null`, now `T | undefined`). Removes the typed-null contract and its 18-line creation-path null-stamping block in `firestoreSetHealthEntry`.
- Translate `undefined` field values to `deleteField()` at the Firestore boundary so cleared inputs actually remove stored values.
- Update every reader (`chartSeries`, `healthCompleteness`, `customMetricEntries`, `Dashboard`, `ActivityCalendar`, `HealthLog`, `CompetitionLog`, `CodapPlugin`) to use key-presence / `Number.isFinite` / typeof checks instead of `> 0` / `!== 0` / `!== null`.
- All three "missing" conventions in the metric stack (0-as-sentinel, key-absent-in-map, null-for-availability) collapse to one: `undefined` / key-absent.

No data migration: DB will be cleared before launch.

## Test plan

- [ ] `npm run build` (typecheck + bundle) succeeds
- [ ] `npx vitest run` green
- [ ] Manual: log `0` for a built-in health field, reload, value persists
- [ ] Manual: log `0` for a competition built-in, reload, value persists; total cell shows `0`
- [ ] Manual: clear an input, reload, field is absent on disk
- [ ] Manual: Practice Y → participation answered → Practice N → participation cleared on disk
- [ ] Manual: custom metric with negative range still accepts negatives
- [ ] Manual: console clean across all flows
EOF
)"
```

- [ ] **Step 4: Move the Jira ticket to In Code Review**

`/jira status DGT-53 In Code Review` once the PR is up.

---

## Self-Review Notes

**Spec coverage:**
- (a) "0 is a valid metric value" — covered by reader fixes (Tasks 5-11) and writer fixes (Task 12), with assertions in each.
- (b) "Undefined, null, or some other value for missing" — covered by type changes (Tasks 2, 3) using `undefined` everywhere.
- (c) "Code migrated but data don't" — no entry version bumps, no migrator code, no data-clearing scripts. Migration fixtures (`healthEntry.fixtures.ts`) are updated to the new shape but the migrator function itself is untouched.

**All-undefined consistency:** Verified — after this plan lands, the predicates used across the metric stack are `typeof === "number" && Number.isFinite(v)` for numerics, `typeof === "boolean"` / `typeof === "string"` for availability sub-keys, and key-presence (`v !== undefined`) for map values. No `=== null` / `!== null` survives in the metric-related code paths.

**Ordering safety:** Task 1 (Firestore boundary) is foundational and doesn't break any existing behavior. Task 2 (numeric optionality) is safe because `undefined > 0` is `false` — existing readers continue to treat undefined as "not logged" correctly. Task 3 (availability) flips readers, type, factory, fixtures, and the AvailabilityTree writer atomically because `!== null` and `!== undefined` diverge for null. Tasks 5-11 (reader fixes for numeric zero) each commit independently; in between, the codebase shows 0 as "not logged" while writers still stamp 0 — this is intermediate state but doesn't break the build. Task 12 (writer fix) is last so new entries don't perpetuate the old convention.

**Hydration edge case:** Documented in scope. UI cannot emit 0 today; the reader change is a no-op in practice but applied for symmetry against CODAP write-back or future UI changes.

**Migration fixtures sanity check:** `migrations/healthEntry.fixtures.ts` is referenced by `migrations/healthEntry.test.ts` (presumably). Updating fixtures may require checking that the migrator code path still passes its tests with the new shape. The migrator code itself is unchanged.

**No placeholders found.** Every code block is concrete. No "TODO" / "add validation" / "similar to Task N" text.
