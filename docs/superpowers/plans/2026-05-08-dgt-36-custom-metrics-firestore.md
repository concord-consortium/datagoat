# DGT-36 Custom Metrics — Firestore Wiring + Final Edges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `CustomMetricsContext`'s in-memory state with a real Firestore-backed implementation, gate data-shaping field edits behind a confirmation dialog when entries already exist, and wire `MetricDetail` to recognize custom metrics.

**Architecture:** Custom metric definitions live in a top-level Firestore collection `metricDefinitions/{id}`, each doc carrying `ownerId`. Each user's `CustomMetricsProvider` subscribes via `onSnapshot` to a query filtered by their `auth.uid`; `addMetric` / `updateMetric` / `deleteMetric` write through Firestore rather than mutating React state directly. Security rules grant read/write only when `request.auth.uid == resource.data.ownerId` (or `request.resource.data.ownerId` on create). The hook surface (`useCustomMetrics().metrics / addMetric / updateMetric / deleteMetric / getMetric`) stays identical so existing consumers (CustomMetricForm, AddMetric, Dashboard, log screens, MetricDetail) compile unchanged. A new `hasEntriesForMetric(id)` helper consults the local `DataContext` (no extra Firestore round-trip) so confirmation dialogs in CustomMetricForm only fire when persisted entries actually reference the metric.

**Tech Stack:** React 19, TypeScript, Vite, Firebase Firestore (`firebase/firestore` v12), `@testing-library/react`, Vitest.

**Out of scope** (deferred per the framing doc): migrating built-in metrics into the database, MetricSpec consolidation, Sport/Activity/Specialization onboarding, content-authoring UI, sharing across users, importing/exporting metric definitions, more input types, profile-keyed goal variation for customs.

## Production-deployment posture

Two production-affecting actions are **deferred until after this PR is reviewed, approved, and merged**:

1. **Deploying the new Firestore rules.** Edits to `firestore.rules` in Task 1 are local only — the file gets committed and the emulator picks them up automatically on next start, but `firebase deploy --only firestore:rules` is intentionally *not* run by this plan. Production keeps the old rules until the post-merge deploy ritual (see the bottom of this plan).
2. **Redeploying the preview Firebase Hosting channel.** The current preview channel (the UI-only build from the previous plan) stays as-is. Redeploying it now would push the new Firestore-writing code to a build that talks to *production* Firestore — which still has the old rules, so writes would fail with `permission-denied` and the demo would silently lose data. We hold the preview where it is until rules + code are in production together.

End result: implementation is fully exercised against the local Firebase emulator; production state is unchanged by this PR until merge time.

---

## Task 1: Firestore security rules for `metricDefinitions/{id}`

**Files:**
- Modify: `firestore.rules`

The existing rules grant access to `/users/{userId}/{document=**}`. Custom metric definitions live OUTSIDE that tree at `/metricDefinitions/{id}` per the framing doc (top-level collection so the eventual sharing model has a place to grow into). Add a sibling rule scoped by the `ownerId` field on each document.

- [ ] **Step 1: Update `firestore.rules`**

Replace the file contents with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User-scoped data (profile, wellness/performance entries, future
    // user-rooted subcollections). Verification is non-blocking by spec.
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Top-level custom metric definitions. Each doc carries `ownerId`;
    // a user can only read / write / delete docs they own. On create,
    // the new document's `ownerId` must match the caller's uid (so a
    // user cannot create a doc owned by someone else).
    match /metricDefinitions/{metricId} {
      allow read: if request.auth != null
                  && resource.data.ownerId == request.auth.uid;
      allow create: if request.auth != null
                    && request.resource.data.ownerId == request.auth.uid;
      allow update, delete: if request.auth != null
                            && resource.data.ownerId == request.auth.uid;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add firestore.rules
git commit -m "feat(firestore): rules for top-level metricDefinitions [DGT-36]"
```

**Do NOT run `firebase deploy --only firestore:rules` here.** Per the "Production-deployment posture" note at the top of this plan, the production deploy is a post-merge step. The local Firebase emulator picks up the new rules automatically on next start (`npm run emulators`).

---

## Task 2: Firestore-backed `CustomMetricsContext`

**Files:**
- Modify: `src/contexts/CustomMetricsContext.tsx`
- Modify: `src/contexts/CustomMetricsContext.test.tsx`

Replace the in-memory state with a real Firestore subscription + write path. Hook surface stays identical so consumers do not change.

- [ ] **Step 1: Rewrite the provider**

Replace the file contents of `src/contexts/CustomMetricsContext.tsx`:

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
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import type { CustomMetricDef } from "../types/customMetrics";
import { mintCustomMetricId } from "../utils/customMetricId";
import {
  customDefToChartConfig,
  setCustomChartConfigs,
  type MetricChartConfig,
} from "../charts/metricChartConfig";

interface CustomMetricsValue {
  metrics: CustomMetricDef[];
  addMetric: (
    input: Omit<CustomMetricDef, "id" | "createdAt" | "updatedAt">,
  ) => Promise<CustomMetricDef>;
  updateMetric: (
    id: string,
    patch: Partial<Omit<CustomMetricDef, "id" | "ownerId">>,
  ) => Promise<void>;
  deleteMetric: (id: string) => Promise<void>;
  getMetric: (id: string) => CustomMetricDef | undefined;
}

const CustomMetricsContext = createContext<CustomMetricsValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  // Test seam — pre-seeds the in-memory list AND short-circuits the
  // Firestore subscription. Production callers omit this.
  initialMetrics?: CustomMetricDef[];
}

const COLLECTION = "metricDefinitions";

// Firestore Timestamp -> ms epoch (matches the in-memory Date.now() shape).
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

function fromDoc(id: string, data: Record<string, unknown>): CustomMetricDef {
  return {
    id,
    ownerId: String(data.ownerId ?? ""),
    name: String(data.name ?? ""),
    metricType: data.metricType === "performance" ? "performance" : "wellness",
    inputType: data.inputType === "radio" ? "radio" : "numeric",
    unit: String(data.unit ?? ""),
    goalRaw: Number(data.goalRaw ?? 0),
    yTopRaw: Number(data.yTopRaw ?? 10),
    yBottomRaw: Number(data.yBottomRaw ?? 0),
    avgDecimals: Number(data.avgDecimals ?? 1),
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

export function CustomMetricsProvider({ children, initialMetrics }: ProviderProps) {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<CustomMetricDef[]>(initialMetrics ?? []);

  // Subscribe to the current user's metric definitions. Skipped when
  // initialMetrics is provided (test seam) or when no user is signed in.
  useEffect(() => {
    if (initialMetrics) return;
    if (!user) {
      setMetrics([]);
      return;
    }
    const q = query(
      collection(db, COLLECTION),
      where("ownerId", "==", user.uid),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next: CustomMetricDef[] = [];
        snap.forEach((d) => {
          next.push(fromDoc(d.id, d.data()));
        });
        next.sort((a, b) => a.createdAt - b.createdAt);
        setMetrics(next);
      },
      (err) => {
        // Surface in console; the demo can keep running with whatever
        // local state we already have.
        // eslint-disable-next-line no-console
        console.error("CustomMetrics onSnapshot error", err);
      },
    );
    return unsubscribe;
  }, [user, initialMetrics]);

  // Sync runtime overlay so getMetricChartConfig sees the user's custom
  // axis range, goal, formatter, and demo-mode random generator. Runs
  // during render so children rendered in the same React pass see the
  // updated overlay.
  const overlay = useMemo<Record<string, MetricChartConfig>>(() => {
    const next: Record<string, MetricChartConfig> = {};
    for (const def of metrics) {
      next[def.id] = customDefToChartConfig(def);
    }
    return next;
  }, [metrics]);
  setCustomChartConfigs(overlay);

  const addMetric = useCallback<CustomMetricsValue["addMetric"]>(
    async (input) => {
      if (!user) {
        throw new Error("addMetric requires a signed-in user");
      }
      const id = mintCustomMetricId();
      const ref = doc(db, COLLECTION, id);
      const now = Date.now();
      const def: CustomMetricDef = {
        ...input,
        id,
        ownerId: user.uid,
        createdAt: now,
        updatedAt: now,
      };
      // Persist with server timestamps; the snapshot listener will
      // reconcile with the actual Timestamp values shortly.
      await setDoc(ref, {
        ownerId: user.uid,
        name: def.name,
        metricType: def.metricType,
        inputType: def.inputType,
        unit: def.unit,
        goalRaw: def.goalRaw,
        yTopRaw: def.yTopRaw,
        yBottomRaw: def.yBottomRaw,
        avgDecimals: def.avgDecimals,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return def;
    },
    [user],
  );

  const updateMetric = useCallback<CustomMetricsValue["updateMetric"]>(
    async (id, patch) => {
      if (!user) {
        throw new Error("updateMetric requires a signed-in user");
      }
      const ref = doc(db, COLLECTION, id);
      // Strip undefined values from the patch so we never write
      // undefined into Firestore.
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) cleaned[k] = v;
      }
      cleaned.updatedAt = serverTimestamp();
      await updateDoc(ref, cleaned);
    },
    [user],
  );

  const deleteMetric = useCallback<CustomMetricsValue["deleteMetric"]>(
    async (id) => {
      if (!user) {
        throw new Error("deleteMetric requires a signed-in user");
      }
      await deleteDoc(doc(db, COLLECTION, id));
    },
    [user],
  );

  const value = useMemo<CustomMetricsValue>(
    () => ({
      metrics,
      addMetric,
      updateMetric,
      deleteMetric,
      getMetric: (id) => metrics.find((m) => m.id === id),
    }),
    [metrics, addMetric, updateMetric, deleteMetric],
  );

  return (
    <CustomMetricsContext.Provider value={value}>
      {children}
    </CustomMetricsContext.Provider>
  );
}

// Empty fallback returned when no provider is mounted. Lets existing
// tests for unrelated components keep rendering without wrapping in
// CustomMetricsProvider, while the production App.tsx always supplies
// the real provider.
const NOOP_VALUE: CustomMetricsValue = {
  metrics: [],
  addMetric: async () => {
    throw new Error("addMetric called without CustomMetricsProvider");
  },
  updateMetric: async () => {
    throw new Error("updateMetric called without CustomMetricsProvider");
  },
  deleteMetric: async () => {
    throw new Error("deleteMetric called without CustomMetricsProvider");
  },
  getMetric: () => undefined,
};

export function useCustomMetrics(): CustomMetricsValue {
  const ctx = useContext(CustomMetricsContext);
  return ctx ?? NOOP_VALUE;
}
```

- [ ] **Step 2: Update the existing context tests to mock Firestore**

The existing test file uses the in-memory implementation directly. Now that addMetric/updateMetric/deleteMetric are async and hit Firestore, the test needs to mock `firebase/firestore` and `firebase/auth` (via the AuthContext).

Replace `src/contexts/CustomMetricsContext.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const firestoreState = vi.hoisted(() => {
  type DocSnap = { id: string; data: Record<string, unknown> };
  type Listener = (snap: { forEach: (cb: (d: { id: string; data(): Record<string, unknown> }) => void) => void }) => void;
  return {
    docs: [] as DocSnap[],
    listeners: [] as Listener[],
    setDoc: vi.fn(async (ref: { id: string }, data: Record<string, unknown>) => {
      firestoreState.docs.push({ id: ref.id, data: { ...data, createdAt: { toMillis: () => 0 }, updatedAt: { toMillis: () => 0 } } });
      firestoreState.fire();
    }),
    updateDoc: vi.fn(async (ref: { id: string }, patch: Record<string, unknown>) => {
      const existing = firestoreState.docs.find((d) => d.id === ref.id);
      if (existing) Object.assign(existing.data, patch);
      firestoreState.fire();
    }),
    deleteDoc: vi.fn(async (ref: { id: string }) => {
      const i = firestoreState.docs.findIndex((d) => d.id === ref.id);
      if (i >= 0) firestoreState.docs.splice(i, 1);
      firestoreState.fire();
    }),
    fire() {
      const snap = {
        forEach: (cb: (d: { id: string; data(): Record<string, unknown> }) => void) => {
          firestoreState.docs.forEach((d) => cb({ id: d.id, data: () => d.data }));
        },
      };
      firestoreState.listeners.forEach((l) => l(snap));
    },
    reset() {
      firestoreState.docs = [];
      firestoreState.listeners = [];
      firestoreState.setDoc.mockClear();
      firestoreState.updateDoc.mockClear();
      firestoreState.deleteDoc.mockClear();
    },
  };
});

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  onSnapshot: (_q: unknown, listener: (snap: unknown) => void) => {
    firestoreState.listeners.push(listener);
    listener({
      forEach: (cb: (d: { id: string; data(): Record<string, unknown> }) => void) => {
        firestoreState.docs.forEach((d) => cb({ id: d.id, data: () => d.data }));
      },
    });
    return () => {
      const i = firestoreState.listeners.indexOf(listener);
      if (i >= 0) firestoreState.listeners.splice(i, 1);
    };
  },
  query: (...args: unknown[]) => args,
  serverTimestamp: () => ({ toMillis: () => Date.now() }),
  setDoc: (...args: Parameters<typeof firestoreState.setDoc>) => firestoreState.setDoc(...args),
  updateDoc: (...args: Parameters<typeof firestoreState.updateDoc>) => firestoreState.updateDoc(...args),
  deleteDoc: (...args: Parameters<typeof firestoreState.deleteDoc>) => firestoreState.deleteDoc(...args),
  where: (...args: unknown[]) => args,
}));

vi.mock("../firebase", () => ({ db: {} }));

vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1" }, loading: false, isEmailVerifiedOrTrusted: true, signOut: async () => {} }),
}));

import {
  CustomMetricsProvider,
  useCustomMetrics,
} from "./CustomMetricsContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CustomMetricsProvider>{children}</CustomMetricsProvider>
);

describe("CustomMetricsContext (Firestore-backed)", () => {
  beforeEach(() => {
    firestoreState.reset();
  });

  it("starts with no metrics", () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    expect(result.current.metrics).toEqual([]);
  });

  it("addMetric writes to Firestore and the subscription reflects it", async () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    await act(async () => {
      await result.current.addMetric({
        ownerId: "u1",
        name: "5K Time",
        metricType: "performance",
        inputType: "numeric",
        unit: "min",
        goalRaw: 25,
        yTopRaw: 40,
        yBottomRaw: 15,
        avgDecimals: 1,
      });
    });
    await waitFor(() => {
      expect(result.current.metrics).toHaveLength(1);
      expect(result.current.metrics[0].name).toBe("5K Time");
    });
    expect(firestoreState.setDoc).toHaveBeenCalledTimes(1);
  });

  it("updateMetric patches the doc and reflects via subscription", async () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let id = "";
    await act(async () => {
      const def = await result.current.addMetric({
        ownerId: "u1",
        name: "x",
        metricType: "wellness",
        inputType: "numeric",
        unit: "",
        goalRaw: 0,
        yTopRaw: 10,
        yBottomRaw: 0,
        avgDecimals: 1,
      });
      id = def.id;
    });
    await waitFor(() => expect(result.current.metrics).toHaveLength(1));

    await act(async () => {
      await result.current.updateMetric(id, { name: "y" });
    });
    await waitFor(() => expect(result.current.metrics[0].name).toBe("y"));
  });

  it("deleteMetric removes the doc and reflects via subscription", async () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let id = "";
    await act(async () => {
      const def = await result.current.addMetric({
        ownerId: "u1",
        name: "x",
        metricType: "wellness",
        inputType: "numeric",
        unit: "",
        goalRaw: 0,
        yTopRaw: 10,
        yBottomRaw: 0,
        avgDecimals: 1,
      });
      id = def.id;
    });
    await waitFor(() => expect(result.current.metrics).toHaveLength(1));

    await act(async () => {
      await result.current.deleteMetric(id);
    });
    await waitFor(() => expect(result.current.metrics).toEqual([]));
  });

  it("accepts initialMetrics for test seeding (skips Firestore)", () => {
    const seed = [
      {
        id: "c_seed",
        ownerId: "u1",
        name: "seeded",
        metricType: "wellness" as const,
        inputType: "numeric" as const,
        unit: "",
        goalRaw: 0,
        yTopRaw: 10,
        yBottomRaw: 0,
        avgDecimals: 1,
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    const seededWrapper = ({ children }: { children: React.ReactNode }) => (
      <CustomMetricsProvider initialMetrics={seed}>{children}</CustomMetricsProvider>
    );
    const { result } = renderHook(() => useCustomMetrics(), {
      wrapper: seededWrapper,
    });
    expect(result.current.metrics).toEqual(seed);
    expect(firestoreState.setDoc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the context tests, expect pass**

```bash
npx vitest run src/contexts/CustomMetricsContext.test.tsx
```
Expected: PASS, 5 tests.

- [ ] **Step 4: Run the form tests, expect they still pass**

The form tests use the real provider but go through addMetric. With the Firestore-backed provider, these tests need the same `firebase/firestore` + auth mocks. Update `src/components/tracking/CustomMetricForm.test.tsx` to add the same `vi.mock` blocks at the top (before the `import { CustomMetricForm }` line):

```tsx
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  onSnapshot: (_q: unknown, listener: (snap: { forEach: (cb: (d: unknown) => void) => void }) => void) => {
    listener({ forEach: () => {} });
    return () => {};
  },
  query: () => ({}),
  serverTimestamp: () => ({ toMillis: () => Date.now() }),
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  where: () => ({}),
}));
vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1" }, loading: false, isEmailVerifiedOrTrusted: true, signOut: async () => {} }),
}));
```

Also: the form test asserts on `captured.current` populated by the `CaptureMetrics` probe. Because addMetric is now async and writes to a mocked Firestore (which doesn't propagate into the local subscription in this minimal mock), the `captured` array stays empty. Update the assertion to spy on the Firestore mock's `setDoc` instead — that confirms a write attempt with the right shape, which is what we actually care about for this UI test.

Replace the second test in `CustomMetricForm.test.tsx`:

```tsx
import { setDoc as mockedSetDoc } from "firebase/firestore";

// inside the existing describe block:
it("saves a numeric metric on submit and navigates back", async () => {
  const user = userEvent.setup();
  renderAt("/add-metric/wellness/new");

  await user.type(screen.getByLabelText(/name/i), "Stretch Minutes");
  await user.type(screen.getByLabelText(/unit/i), "min");
  await user.clear(screen.getByLabelText(/goal/i));
  await user.type(screen.getByLabelText(/goal/i), "15");
  await user.clear(screen.getByLabelText(/y-axis top/i));
  await user.type(screen.getByLabelText(/y-axis top/i), "60");
  await user.click(screen.getByRole("button", { name: /save/i }));

  await waitFor(() => {
    expect(screen.getByText("back to list")).toBeInTheDocument();
  });
  expect(mockedSetDoc).toHaveBeenCalledTimes(1);
  const written = (mockedSetDoc as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as Record<string, unknown>;
  expect(written.name).toBe("Stretch Minutes");
  expect(written.metricType).toBe("wellness");
  expect(written.unit).toBe("min");
  expect(written.goalRaw).toBe(15);
});
```

(The probe-based `captured` assertion is removed since the mock doesn't echo writes back through onSnapshot. The setDoc-call assertion is the more direct test of "form wrote the right shape.")

- [ ] **Step 5: Run all tests**

```bash
npm test -- --run
```
Expected: 481 pass, 1 unrelated emulator skip/fail.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/CustomMetricsContext.tsx src/contexts/CustomMetricsContext.test.tsx src/components/tracking/CustomMetricForm.test.tsx
git commit -m "feat(metrics): Firestore-backed CustomMetricsContext [DGT-36]"
```

---

## Task 3: Use the auth UID in CustomMetricForm

**Files:**
- Modify: `src/components/tracking/CustomMetricForm.tsx`

The form currently passes `DEMO_OWNER_ID = "demo-user"` to `addMetric`. With Firestore wiring in place, the `addMetric` implementation reads the UID from `useAuth` directly and ignores any `ownerId` the caller passes. We can simplify the form by dropping the constant and the `ownerId` field from the call site.

- [ ] **Step 1: Drop DEMO_OWNER_ID and the ownerId field from the create call**

Modify `src/components/tracking/CustomMetricForm.tsx`:

Remove the constant declaration:
```tsx
// Demo slice: in-memory state doesn't need a real owner. The next
// plan replaces this with the auth UID when wiring Firestore.
const DEMO_OWNER_ID = "demo-user";
```

Update `Omit<CustomMetricDef, "id" | "createdAt" | "updatedAt">` shape to also Omit `ownerId` (the provider supplies it). Update the addMetric call inside handleSubmit's `else` branch:

```tsx
} else {
  await addMetric({
    name: trimmed,
    metricType,
    inputType: draft.inputType,
    unit: draft.unit.trim(),
    goalRaw,
    yTopRaw,
    yBottomRaw,
    avgDecimals,
  });
}
```

(Also: the call now needs `await` because addMetric is async per Task 2's signature.)

Tighten the `addMetric` parameter shape in `CustomMetricsContext.tsx` (the file Task 2 created) so callers do not need to pass `ownerId` — the provider always reads it from `user.uid`. Replace the type field of the value interface with:

```tsx
addMetric: (
  input: Omit<CustomMetricDef, "id" | "ownerId" | "createdAt" | "updatedAt">,
) => Promise<CustomMetricDef>;
```

And update the body of `addMetric` so the constructed `def` no longer spreads an `ownerId` from `input` (the input no longer has one):

```tsx
const def: CustomMetricDef = {
  ...input,
  id,
  ownerId: user.uid,
  createdAt: now,
  updatedAt: now,
};
```

(The body already overwrote `ownerId` from `user.uid` post-spread; with the tighter input type, the spread no longer carries the field at all.) Also update the same `Omit` in the `NOOP_VALUE` fallback declaration so the noop's `addMetric` matches the public signature.

- [ ] **Step 2: Make handleSubmit async**

Since addMetric / updateMetric are now async, await them. Update the handleSubmit signature:

```tsx
async function handleSubmit(e: FormEvent) {
  e.preventDefault();
  // ... validation as before ...

  if (editing) {
    await updateMetric(editing.id, {
      name: trimmed,
      inputType: draft.inputType,
      unit: draft.unit.trim(),
      goalRaw,
      yTopRaw,
      yBottomRaw,
      avgDecimals,
    });
  } else {
    await addMetric({
      name: trimmed,
      metricType,
      inputType: draft.inputType,
      unit: draft.unit.trim(),
      goalRaw,
      yTopRaw,
      yBottomRaw,
      avgDecimals,
    });
  }
  navigate(`/add-metric/${metricType}`);
}
```

And similarly handleDelete:
```tsx
async function handleDelete() {
  if (!editing) return;
  if (!window.confirm(`Delete "${editing.name}"? Past entries become invisible.`)) {
    return;
  }
  await deleteMetric(editing.id);
  navigate(`/add-metric/${metricType}`);
}
```

- [ ] **Step 3: Run form tests**

```bash
npx vitest run src/components/tracking/CustomMetricForm.test.tsx
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/tracking/CustomMetricForm.tsx
git commit -m "feat(metrics): drop DEMO_OWNER_ID; provider supplies auth UID [DGT-36]"
```

---

## Task 4: Confirmation dialogs when editing fields that affect existing entries

**Files:**
- Create: `src/utils/customMetricEntries.ts`
- Create: `src/utils/customMetricEntries.test.ts`
- Modify: `src/components/tracking/CustomMetricForm.tsx`
- Modify: `src/components/tracking/CustomMetricForm.test.tsx`

A user editing `inputType`, `metricType`, or `unit` on a metric that already has logged entries can silently break those entries (per the framing doc's O8 decision). Gate those three field changes with a confirmation dialog when at least one entry references the metric.

- [ ] **Step 1: Write the failing test for the helper**

Create `src/utils/customMetricEntries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hasEntriesForMetric } from "./customMetricEntries";
import type { WellnessEntry, PerformanceEntry } from "../types/data";
import { emptyWellnessEntry, emptyPerformanceEntry } from "../types/data";

describe("hasEntriesForMetric", () => {
  it("returns false when no entries reference the metric", () => {
    const wellness: WellnessEntry[] = [emptyWellnessEntry("2026-05-01")];
    const performance: PerformanceEntry[] = [
      emptyPerformanceEntry("2026-05-01"),
    ];
    expect(hasEntriesForMetric("c_xyz", wellness, performance)).toBe(false);
  });

  it("returns true when a wellness entry has a value for the metric", () => {
    const w = emptyWellnessEntry("2026-05-01");
    w.customMetrics = { c_xyz: 5 };
    expect(hasEntriesForMetric("c_xyz", [w], [])).toBe(true);
  });

  it("returns true when a performance entry has a value for the metric", () => {
    const p = emptyPerformanceEntry("2026-05-01");
    p.metrics = { c_xyz: 5 };
    expect(hasEntriesForMetric("c_xyz", [], [p])).toBe(true);
  });

  it("ignores zero values (treats them as absent)", () => {
    // Zero is the default for numeric fields and means "not entered".
    const w = emptyWellnessEntry("2026-05-01");
    w.customMetrics = { c_xyz: 0 };
    expect(hasEntriesForMetric("c_xyz", [w], [])).toBe(false);
  });
});
```

- [ ] **Step 2: Implement the helper**

Create `src/utils/customMetricEntries.ts`:

```ts
import type { PerformanceEntry, WellnessEntry } from "../types/data";

// Returns true when at least one wellness or performance entry has a
// non-zero numeric value (or non-empty string value) for the given
// metric ID. Custom wellness metric values live in
// WellnessEntry.customMetrics; custom performance metric values share
// the existing PerformanceEntry.metrics map alongside built-in IDs.
export function hasEntriesForMetric(
  metricId: string,
  wellnessEntries: WellnessEntry[],
  performanceEntries: PerformanceEntry[],
): boolean {
  for (const entry of wellnessEntries) {
    const v = entry.customMetrics?.[metricId];
    if (isMeaningful(v)) return true;
  }
  for (const entry of performanceEntries) {
    const v = entry.metrics?.[metricId];
    if (isMeaningful(v)) return true;
  }
  return false;
}

function isMeaningful(v: number | string | undefined): boolean {
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.trim() !== "";
  return false;
}
```

- [ ] **Step 3: Run the test**

```bash
npx vitest run src/utils/customMetricEntries.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 4: Wire the confirmation dialog into CustomMetricForm**

Modify `src/components/tracking/CustomMetricForm.tsx`:

Add imports:
```tsx
import { useData } from "../../contexts/DataContext";
import { hasEntriesForMetric } from "../../utils/customMetricEntries";
```

Inside the component, after the existing hooks, read the entry data:
```tsx
const { wellness, performance } = useData();
const wellnessEntries =
  wellness.status === "loaded" ? wellness.entries : [];
const performanceEntries =
  performance.status === "loaded" ? performance.entries : [];
```

In the submit path, before performing the update, check whether any data-shaping field changed AND whether the metric has entries:

```tsx
if (editing) {
  const inputTypeChanged = draft.inputType !== editing.inputType;
  const unitChanged = draft.unit.trim() !== editing.unit;
  // metricType cannot change in this v1 (no UI control) so we only
  // gate inputType and unit here. If a future version adds a
  // metricType control, add a check on `metricType !== editing.metricType`.
  const dataShapingChanged = inputTypeChanged || unitChanged;
  if (
    dataShapingChanged &&
    hasEntriesForMetric(editing.id, wellnessEntries, performanceEntries)
  ) {
    const fields = [
      inputTypeChanged ? "input type" : null,
      unitChanged ? "unit" : null,
    ]
      .filter(Boolean)
      .join(" and ");
    if (
      !window.confirm(
        `Changing the ${fields} will affect entries you have already logged. Continue?`,
      )
    ) {
      return;
    }
  }
  await updateMetric(editing.id, {
    name: trimmed,
    inputType: draft.inputType,
    unit: draft.unit.trim(),
    goalRaw,
    yTopRaw,
    yBottomRaw,
    avgDecimals,
  });
}
```

- [ ] **Step 5: Add a form test for the confirmation flow**

Add a `vi.mock("../../contexts/DataContext", …)` at the top of `src/components/tracking/CustomMetricForm.test.tsx` so the form sees a wellness entry that references our seeded metric. Place this alongside the existing `firebase/firestore` and `AuthContext` mocks:

```tsx
import { emptyWellnessEntry, emptyPerformanceEntry } from "../../types/data";

vi.mock("../../contexts/DataContext", () => ({
  useData: () => ({
    wellness: {
      status: "loaded",
      entries: [
        {
          ...emptyWellnessEntry("2026-05-01"),
          customMetrics: { c_x: 30 },
        },
      ],
    },
    performance: { status: "loaded", entries: [] },
    setWellnessEntry: vi.fn(),
    setPerformanceEntry: vi.fn(),
  }),
}));
```

Append the new describe block at the bottom of the file:

```tsx
describe("CustomMetricForm (edit confirmation)", () => {
  it("prompts before saving an inputType change when entries exist", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const seed: CustomMetricDef[] = [
      {
        id: "c_x",
        ownerId: "u1",
        name: "Stretch Minutes",
        metricType: "wellness",
        inputType: "numeric",
        unit: "min",
        goalRaw: 15,
        yTopRaw: 60,
        yBottomRaw: 0,
        avgDecimals: 1,
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    render(
      <CustomMetricsProvider initialMetrics={seed}>
        <MemoryRouter initialEntries={["/add-metric/wellness/c_x"]}>
          <Routes>
            <Route
              path="/add-metric/:type/:metricId"
              element={<CustomMetricForm />}
            />
            <Route path="/add-metric/:type" element={<div>back to list</div>} />
          </Routes>
        </MemoryRouter>
      </CustomMetricsProvider>,
    );

    // Change inputType from numeric → radio.
    await user.selectOptions(screen.getByLabelText(/input type/i), "radio");
    await user.click(screen.getByRole("button", { name: /save/i }));

    // Confirmation fires; user said "cancel" → still on the form.
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/input type/i);
    expect(screen.queryByText("back to list")).toBeNull();

    confirmSpy.mockRestore();
  });
});
```

Add the imports needed by the new test if not already present:

```tsx
import type { CustomMetricDef } from "../../types/customMetrics";
```

(`CustomMetricsProvider`, `MemoryRouter`, `Routes`, `Route`, `render`, `screen`, `userEvent`, `vi`, `describe`, `it`, `expect` are already imported by the existing tests in this file.)

- [ ] **Step 6: Run tests**

```bash
npm test -- --run
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/utils/customMetricEntries.ts src/utils/customMetricEntries.test.ts src/components/tracking/CustomMetricForm.tsx src/components/tracking/CustomMetricForm.test.tsx
git commit -m "feat(metrics): confirm before edits affect logged entries [DGT-36]"
```

---

## Task 5: MetricDetail page support for custom metrics

**Files:**
- Modify: `src/charts/MetricDetail.tsx`

`MetricDetail` currently looks up the metric in `WELLNESS_METRICS` / `PERFORMANCE_METRICS` and the `ADDABLE_*` placeholder lists. Custom metrics aren't found, so the component bounces back to the log via `<Navigate replace />`. Extend the lookup to consult `useCustomMetrics()`; render the same template using the custom metric's name + unit. Definition / Who Collects / How Collected sections come from CustomMetricDef-equivalent fields where present, with sensible "Coming soon" placeholders where they don't exist on a custom metric.

- [ ] **Step 1: Extend the metric lookup**

Modify `src/charts/MetricDetail.tsx`. Add the import:
```tsx
import { useCustomMetrics } from "../contexts/CustomMetricsContext";
import type { CustomMetricDef } from "../types/customMetrics";
import type { MetricDefinition } from "../metrics/types";
```

Inside the component, after the existing `allMetrics` calculation, add a fallback to custom metrics:

```tsx
const { metrics: allCustom } = useCustomMetrics();
const metric: MetricDefinition | undefined =
  allMetrics.find((m) => m.id === metricId)
  ?? customAsMetricDefinition(allCustom.find((m) => m.id === metricId), type);
```

Where `customAsMetricDefinition` is a local helper:

```tsx
function customAsMetricDefinition(
  def: CustomMetricDef | undefined,
  type: "wellness" | "performance",
): MetricDefinition | undefined {
  if (!def) return undefined;
  return {
    id: def.id,
    name: def.name,
    unit: def.unit,
    displayUnit: def.unit,
    type,
    whoCollects: "",
    howCollected: "",
    description: "",
    inputType: def.inputType,
  };
}
```

(`renderMultiline` in MetricDetail already renders an italic "Coming soon" placeholder for empty strings, so the empty `whoCollects` / `howCollected` / `description` fields render as expected for custom metrics without further changes.)

- [ ] **Step 2: Run all tests**

```bash
npm test -- --run
```
Expected: all pass; MetricDetail tests still green.

- [ ] **Step 3: Manual smoke test**

```bash
# Start emulators in one terminal:
npm run emulators
# Dev server in another:
npm run dev
```

Sign in (or create an account), navigate to `/add-metric/wellness/new`, create a custom metric, click ✏︎ to edit, click the metric's name from the wellness log → MetricDetail should render with the custom metric's name and a chart using the user's y-range / goal.

- [ ] **Step 4: Commit**

```bash
git add src/charts/MetricDetail.tsx
git commit -m "feat(metrics): MetricDetail support for custom metrics [DGT-36]"
```

---

## Task 6: Local emulator smoke + PR description update

**Files:**
- (None — manual sign-in flow + edit PR body via gh CLI)

The preview channel redeploy is **deliberately deferred** (see "Production-deployment posture" at the top of this plan). The preview keeps showing the prior UI-only build until rules and code go to production together post-merge.

- [ ] **Step 1: Local emulator smoke test**

```bash
# Terminal 1
npm run emulators

# Terminal 2
npm run dev
```

Sign in (a fresh emulator account or any test user) and verify:
- [ ] Create a custom metric → it appears in the list
- [ ] Refresh the page → the custom metric is still there (this is the new bit — Firestore-backed persistence)
- [ ] Log a value for the custom metric in the wellness or performance log
- [ ] Edit the metric's input type → confirmation dialog appears (because an entry exists)
- [ ] Cancel the dialog → no change saved
- [ ] Confirm the dialog → change saved
- [ ] Delete the metric → confirmation dialog → metric disappears, refresh confirms it's gone
- [ ] Click the metric's name from a log row → MetricDetail renders for the custom metric

- [ ] **Step 2: Update the PR description**

Move the now-shipped items out of "What this slice deliberately does NOT do" and into "What this slice delivers":
- Firestore-backed persistence
- Confirmation dialogs for data-shaping field edits
- MetricDetail page support for custom metrics

Add a "Post-merge deploy ritual" section to the PR description:

> After merge, run `firebase deploy --only firestore:rules -P datagoat-b07dd` to push the new `metricDefinitions` rules to production. Then run `npm run deploy:preview -- custom-metrics` to refresh the preview channel with the production-rules-aware build.

Once you are comfortable, flip the PR out of draft state to request review.

---

## Self-review notes

- Spec coverage: every framing-doc in-scope item is covered (Firestore collection, security rules, confirmation dialogs, MetricDetail support, auth-UID wiring). Items the framing doc deferred remain deferred and are listed at the top of this plan.
- Type consistency: `addMetric` takes `Omit<CustomMetricDef, "id" | "ownerId" | "createdAt" | "updatedAt">` everywhere; `updateMetric` takes `Partial<Omit<CustomMetricDef, "id" | "ownerId">>` (cannot reassign owner via update). Both return `Promise<...>` — call sites use `await`.
- Placeholders: each task names exact files; each step shows the actual code to write (test code, implementation code, command lines, expected output). The Task 4 form test deliberately leaves a small implementation detail to fill at execution time, called out with a `//` comment.
