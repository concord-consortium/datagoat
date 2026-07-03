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

// A recognizable sentinel standing in for the real Firestore deleteField()
// FieldValue. Kept as a single stable object so tests can assert `toBe`
// equality regardless of how many times deleteField() is invoked.
const DELETE_FIELD_SENTINEL = vi.hoisted(() => ({
  __isDeleteFieldSentinel: true,
}));

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
  deleteField: () => DELETE_FIELD_SENTINEL,
  setDoc: (...args: Parameters<typeof firestoreState.setDoc>) => firestoreState.setDoc(...args),
  updateDoc: (...args: Parameters<typeof firestoreState.updateDoc>) => firestoreState.updateDoc(...args),
  deleteDoc: (...args: Parameters<typeof firestoreState.deleteDoc>) => firestoreState.deleteDoc(...args),
  where: (...args: unknown[]) => args,
}));

vi.mock("../firebase", () => ({ db: {} }));

const stableAuth = vi.hoisted(() => ({
  user: { uid: "u1" } as { uid: string },
  loading: false,
  isEmailVerifiedOrTrusted: true,
  signOut: async () => {},
}));

vi.mock("./AuthContext", () => ({
  useAuth: () => stableAuth,
}));

import {
  CustomMetricsProvider,
  useCustomMetrics,
  fromDoc,
} from "./CustomMetricsContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CustomMetricsProvider>{children}</CustomMetricsProvider>
);

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

  it("reads a well-formed schedule", () => {
    const def = fromDoc("c_s", {
      ownerId: "u1",
      name: "Weigh-in",
      metricType: "health",
      primitive: "numeric",
      inputType: "numeric",
      referenceUrl: "",
      schedule: { period: "weekly", count: 2 },
    });
    expect(def.schedule).toEqual({ period: "weekly", count: 2 });
  });

  it("omits count when absent in the stored schedule", () => {
    const def = fromDoc("c_s2", {
      ownerId: "u1",
      name: "Weigh-in",
      metricType: "health",
      primitive: "numeric",
      inputType: "numeric",
      referenceUrl: "",
      schedule: { period: "monthly" },
    });
    expect(def.schedule).toEqual({ period: "monthly" });
  });

  it("treats an absent or malformed schedule as undefined (=> irregular)", () => {
    const base = {
      ownerId: "u1",
      name: "Legacy",
      metricType: "health" as const,
      primitive: "numeric" as const,
      inputType: "numeric" as const,
      referenceUrl: "",
    };
    expect(fromDoc("c_a1", base).schedule).toBeUndefined();
    expect(
      fromDoc("c_a2", { ...base, schedule: { period: "fortnightly" } })
        .schedule,
    ).toBeUndefined();
    expect(
      fromDoc("c_a3", { ...base, schedule: "daily" }).schedule,
    ).toBeUndefined();
  });
});

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
        name: "5K Time",
        metricType: "competition",
        primitive: "numeric",
        inputType: "numeric",
        unit: "min",
        goalRaw: 25,
        yTopRaw: 40,
        yBottomRaw: 15,
        avgDecimals: 1,
        referenceUrl: "",
      });
    });
    await waitFor(() => {
      expect(result.current.metrics).toHaveLength(1);
      expect(result.current.metrics[0].name).toBe("5K Time");
    });
    expect(firestoreState.setDoc).toHaveBeenCalledTimes(1);
  });

  it("addMetric persists a schedule when supplied", async () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    await act(async () => {
      await result.current.addMetric({
        name: "Body Fat %",
        metricType: "health",
        primitive: "numeric",
        inputType: "numeric",
        unit: "%",
        referenceUrl: "",
        schedule: { period: "monthly" },
      });
    });
    await waitFor(() => {
      expect(result.current.metrics).toHaveLength(1);
      expect(result.current.metrics[0].schedule).toEqual({ period: "monthly" });
    });
  });

  it("updateMetric patches the doc and reflects via subscription", async () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let id = "";
    await act(async () => {
      const def = await result.current.addMetric({
        name: "x",
        metricType: "health",
        primitive: "numeric",
        inputType: "numeric",
        unit: "",
        goalRaw: 0,
        yTopRaw: 10,
        yBottomRaw: 0,
        avgDecimals: 1,
        referenceUrl: "",
      });
      id = def.id;
    });
    await waitFor(() => expect(result.current.metrics).toHaveLength(1));

    await act(async () => {
      await result.current.updateMetric(id, { name: "y" });
    });
    await waitFor(() => expect(result.current.metrics[0].name).toBe("y"));
  });

  it("updateMetric normalizes a schedule patch through scheduleToFirestore", async () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let id = "";
    await act(async () => {
      const def = await result.current.addMetric({
        name: "x",
        metricType: "health",
        primitive: "numeric",
        inputType: "numeric",
        referenceUrl: "",
      });
      id = def.id;
    });
    await waitFor(() => expect(result.current.metrics).toHaveLength(1));

    await act(async () => {
      // A stray count on an irregular schedule must be dropped on write,
      // matching the create path (not written through as-is).
      await result.current.updateMetric(id, {
        schedule: { period: "irregular", count: 5 },
      });
    });

    const lastPatch = firestoreState.updateDoc.mock.calls.at(-1)![1] as Record<
      string,
      unknown
    >;
    expect(lastPatch.schedule).toEqual({ period: "irregular" });
  });

  it("updateMetric clears a stale timePrecision via deleteField when the patch omits it (DGT-19 finding 2)", async () => {
    // Regression: a Time metric edited back to plain Number sends a
    // patch/payload without timePrecision. The old strip-undefined loop
    // dropped the key entirely instead of clearing it, so updateDoc never
    // told Firestore to remove the stale value - it stayed stored, and
    // re-opening the edit form would re-infer Format=Time.
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let id = "";
    await act(async () => {
      const def = await result.current.addMetric({
        name: "400m Time",
        metricType: "performance",
        primitive: "numeric",
        inputType: "numeric",
        unit: "min",
        timePrecision: "s",
        goalRaw: 0,
        yTopRaw: 10,
        yBottomRaw: 0,
        avgDecimals: 1,
        referenceUrl: "",
      });
      id = def.id;
    });
    await waitFor(() => expect(result.current.metrics).toHaveLength(1));

    // Format toggled Time -> Number: the patch carries no timePrecision.
    await act(async () => {
      await result.current.updateMetric(id, { name: "400m Time", unit: "min" });
    });

    const lastPatch = firestoreState.updateDoc.mock.calls.at(-1)![1] as Record<
      string,
      unknown
    >;
    expect(lastPatch.timePrecision).toBe(DELETE_FIELD_SENTINEL);
  });

  it("updateMetric writes the real timePrecision (no deleteField) when the patch carries it", async () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let id = "";
    await act(async () => {
      const def = await result.current.addMetric({
        name: "400m Time",
        metricType: "performance",
        primitive: "numeric",
        inputType: "numeric",
        unit: "min",
        referenceUrl: "",
      });
      id = def.id;
    });
    await waitFor(() => expect(result.current.metrics).toHaveLength(1));

    await act(async () => {
      await result.current.updateMetric(id, { timePrecision: "s" });
    });

    const lastPatch = firestoreState.updateDoc.mock.calls.at(-1)![1] as Record<
      string,
      unknown
    >;
    expect(lastPatch.timePrecision).toBe("s");
  });

  it("deleteMetric removes the doc and reflects via subscription", async () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let id = "";
    await act(async () => {
      const def = await result.current.addMetric({
        name: "x",
        metricType: "health",
        primitive: "numeric",
        inputType: "numeric",
        unit: "",
        goalRaw: 0,
        yTopRaw: 10,
        yBottomRaw: 0,
        avgDecimals: 1,
        referenceUrl: "",
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
        metricType: "health" as const,
        primitive: "numeric" as const,
        inputType: "numeric" as const,
        unit: "",
        goalRaw: 0,
        yTopRaw: 10,
        yBottomRaw: 0,
        avgDecimals: 1,
        referenceUrl: "",
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
