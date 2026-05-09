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
        name: "5K Time",
        metricType: "performance",
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

  it("updateMetric patches the doc and reflects via subscription", async () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let id = "";
    await act(async () => {
      const def = await result.current.addMetric({
        name: "x",
        metricType: "wellness",
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

  it("deleteMetric removes the doc and reflects via subscription", async () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let id = "";
    await act(async () => {
      const def = await result.current.addMetric({
        name: "x",
        metricType: "wellness",
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
        metricType: "wellness" as const,
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
