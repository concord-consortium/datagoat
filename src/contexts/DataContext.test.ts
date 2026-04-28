// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";

const mockUser = vi.hoisted(() => ({
  current: null as { uid: string } | null,
}));

const wellnessSnapshotCb = vi.hoisted(() => ({
  cb: null as ((s: unknown) => void) | null,
}));
const performanceSnapshotCb = vi.hoisted(() => ({
  cb: null as ((s: unknown) => void) | null,
}));

vi.mock("firebase/firestore", () => ({
  collection: (..._args: unknown[]) => ({
    path:
      _args.includes("wellnessEntries")
        ? "users/u1/wellnessEntries"
        : "users/u1/performanceEntries",
  }),
  doc: () => ({ path: "users/u1/wellnessEntries/2026-04-28" }),
  onSnapshot: (
    ref: { path: string },
    cb: (s: unknown) => void,
  ) => {
    if (ref.path.includes("wellnessEntries")) {
      wellnessSnapshotCb.cb = cb;
    } else if (ref.path.includes("performanceEntries")) {
      performanceSnapshotCb.cb = cb;
    }
    return () => undefined;
  },
  setDoc: async () => undefined,
}));

vi.mock("../firebase", () => ({
  db: {},
}));

vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: mockUser.current }),
}));

vi.mock("../utils/logError", () => ({
  logError: vi.fn(),
}));

import { DataProvider, useData } from "./DataContext";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(DataProvider, null, children);
}

function makeSnapshot(docs: { path: string; data: Record<string, unknown> }[]) {
  return {
    forEach: (cb: (d: {
      ref: { path: string };
      data: () => Record<string, unknown>;
    }) => void) => {
      docs.forEach((d) =>
        cb({
          ref: { path: d.path },
          data: () => d.data,
        }),
      );
    },
  };
}

describe("DataContext bi-state transitions", () => {
  beforeEach(() => {
    mockUser.current = null;
    wellnessSnapshotCb.cb = null;
    performanceSnapshotCb.cb = null;
  });

  it("starts in 'loading' for both kinds when no user is signed in", () => {
    const { result } = renderHook(() => useData(), { wrapper });
    expect(result.current.wellness.status).toBe("loading");
    expect(result.current.performance.status).toBe("loading");
  });

  it("transitions wellness loading -> loaded with empty entries", async () => {
    mockUser.current = { uid: "u1" };
    const { result } = renderHook(() => useData(), { wrapper });
    expect(result.current.wellness.status).toBe("loading");

    act(() => {
      wellnessSnapshotCb.cb!(makeSnapshot([]));
    });
    await waitFor(() => {
      expect(result.current.wellness.status).toBe("loaded");
      if (result.current.wellness.status === "loaded") {
        expect(result.current.wellness.entries).toEqual([]);
      }
    });
  });

  it("transitions wellness loading -> loaded with migrated entries", async () => {
    mockUser.current = { uid: "u1" };
    const { result } = renderHook(() => useData(), { wrapper });

    act(() => {
      wellnessSnapshotCb.cb!(
        makeSnapshot([
          {
            path: "users/u1/wellnessEntries/2026-04-28",
            data: {
              version: 1,
              date: "2026-04-28",
              hydration: 4,
              sleepTime: 8,
              sleepEfficiency: 85,
              protein: 1.5,
              leanMass: 60,
              availability: {
                practiceHeld: false,
                practiceParticipation: null,
                gameHeld: false,
                gameParticipation: null,
              },
            },
          },
        ]),
      );
    });

    await waitFor(() => {
      expect(result.current.wellness.status).toBe("loaded");
      if (result.current.wellness.status === "loaded") {
        expect(result.current.wellness.entries.length).toBe(1);
        expect(result.current.wellness.entries[0].hydration).toBe(4);
      }
    });
  });

  it("wellness and performance load states are independent", async () => {
    mockUser.current = { uid: "u1" };
    const { result } = renderHook(() => useData(), { wrapper });

    act(() => {
      wellnessSnapshotCb.cb!(makeSnapshot([]));
    });
    await waitFor(() => {
      expect(result.current.wellness.status).toBe("loaded");
    });
    // Performance should still be loading.
    expect(result.current.performance.status).toBe("loading");

    act(() => {
      performanceSnapshotCb.cb!(makeSnapshot([]));
    });
    await waitFor(() => {
      expect(result.current.performance.status).toBe("loaded");
    });
  });
});
