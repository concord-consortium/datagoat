// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { renderHook, act, waitFor, render } from "@testing-library/react";
import { createElement, useState, type ReactNode } from "react";
import {
  firestoreMockFactory,
  authMockFactory,
  latestSub,
  resetFirestoreState,
  type FirestoreMockState,
  type MockSnapshotDoc,
  type MockSubscriptionHandle,
} from "../test/firestoreMocks";

const state = vi.hoisted<FirestoreMockState>(() => ({
  setDoc: vi.fn(async () => undefined),
  wellnessSubs: [],
  performanceSubs: [],
  user: { current: null },
}));

vi.mock("firebase/firestore", () => firestoreMockFactory(state));
vi.mock("../firebase", () => ({ db: {} }));
vi.mock("./AuthContext", () => authMockFactory(state));
vi.mock("../utils/logError", () => ({ logError: vi.fn() }));

import { DataProvider, useData } from "./DataContext";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(DataProvider, null, children);
}

function emit(
  sub: MockSubscriptionHandle | undefined,
  docs: MockSnapshotDoc[],
) {
  if (!sub) throw new Error("no active subscription");
  act(() => {
    sub.emit(docs);
  });
}

const WELLNESS_DATE = "2026-04-28";
const WELLNESS_DATE_B = "2026-04-29";

const FULL_AVAILABILITY = {
  practiceHeld: false,
  practiceParticipation: null,
  gameHeld: false,
  gameParticipation: null,
} as const;

beforeEach(() => {
  resetFirestoreState(state);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DataContext bi-state transitions", () => {
  it("starts in 'loading' for both kinds when no user is signed in", () => {
    const { result } = renderHook(() => useData(), { wrapper });
    expect(result.current.wellness.status).toBe("loading");
    expect(result.current.performance.status).toBe("loading");
  });

  it("transitions wellness loading -> loaded with empty entries", async () => {
    state.user.current = { uid: "u1" };
    const { result } = renderHook(() => useData(), { wrapper });
    expect(result.current.wellness.status).toBe("loading");
    emit(latestSub(state.wellnessSubs), []);
    await waitFor(() => {
      expect(result.current.wellness.status).toBe("loaded");
      if (result.current.wellness.status === "loaded") {
        expect(result.current.wellness.entries).toEqual([]);
      }
    });
  });

  it("transitions wellness loading -> loaded with migrated entries", async () => {
    state.user.current = { uid: "u1" };
    const { result } = renderHook(() => useData(), { wrapper });
    emit(latestSub(state.wellnessSubs), [
      {
        path: `users/u1/wellnessEntries/${WELLNESS_DATE}`,
        data: {
          version: 1,
          date: WELLNESS_DATE,
          hydration: 4,
          sleepTime: 8,
          sleepEfficiency: 85,
          protein: 1.5,
          leanMass: 60,
          availability: FULL_AVAILABILITY,
        },
      },
    ]);
    await waitFor(() => {
      expect(result.current.wellness.status).toBe("loaded");
      if (result.current.wellness.status === "loaded") {
        expect(result.current.wellness.entries.length).toBe(1);
        expect(result.current.wellness.entries[0].hydration).toBe(4);
      }
    });
  });

  it("wellness and performance load states are independent", async () => {
    state.user.current = { uid: "u1" };
    const { result } = renderHook(() => useData(), { wrapper });
    emit(latestSub(state.wellnessSubs), []);
    await waitFor(() => {
      expect(result.current.wellness.status).toBe("loaded");
    });
    expect(result.current.performance.status).toBe("loading");
    emit(latestSub(state.performanceSubs), []);
    await waitFor(() => {
      expect(result.current.performance.status).toBe("loaded");
    });
  });
});

// Helper: drive snapshot synchronously and assert state is loaded
// without relying on waitFor (waitFor uses real timers and deadlocks
// under vi.useFakeTimers).
function driveLoaded(
  result: { current: ReturnType<typeof useData> },
  uid: string,
) {
  emit(latestSub(state.wellnessSubs), []);
  emit(latestSub(state.performanceSubs), []);
  if (result.current.wellness.status !== "loaded") {
    throw new Error(`wellness not loaded after emit (uid=${uid})`);
  }
  if (result.current.performance.status !== "loaded") {
    throw new Error(`performance not loaded after emit (uid=${uid})`);
  }
}

describe("DataContext debounce accumulator (lifted from log components)", () => {
  beforeEach(() => {
    state.user.current = { uid: "u1" };
    vi.useFakeTimers();
  });

  it("single-field typing fires one setDoc after 500ms idle", () => {
    const { result } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "u1");
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 5 });
    });
    expect(state.setDoc).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(state.setDoc).toHaveBeenCalledTimes(1);
    expect(state.setDoc.mock.calls[0][1]).toMatchObject({
      hydration: 5,
      date: WELLNESS_DATE,
      version: 1,
    });
  });

  it("multi-field typing within 500ms fires one merged setDoc", () => {
    const { result } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "u1");
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 5 });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { sleepTime: 8 });
    });
    expect(state.setDoc).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(state.setDoc).toHaveBeenCalledTimes(1);
    expect(state.setDoc.mock.calls[0][1]).toMatchObject({
      hydration: 5,
      sleepTime: 8,
    });
  });

  it("typing on date A then date B flushes both independently (per-date timers)", () => {
    const { result } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "u1");
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 5 });
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE_B, { sleepTime: 8 });
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(state.setDoc).toHaveBeenCalledTimes(2);
    const calls = state.setDoc.mock.calls.map((c) => c[1]);
    expect(calls).toContainEqual(
      expect.objectContaining({ hydration: 5, date: WELLNESS_DATE }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ sleepTime: 8, date: WELLNESS_DATE_B }),
    );
  });

  it("provider unmount flushes all pending dates with their captured uid", () => {
    state.user.current = { uid: "userA" };
    const { result, unmount } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "userA");
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 5 });
      result.current.setWellnessEntry(WELLNESS_DATE_B, { hydration: 3 });
    });
    expect(state.setDoc).not.toHaveBeenCalled();
    unmount();
    expect(state.setDoc).toHaveBeenCalledTimes(2);
    for (const call of state.setDoc.mock.calls) {
      const ref = call[0] as { path: string };
      expect(ref.path).toContain("userA");
    }
  });

  it("4b sign-out: pending writes are dropped, not flushed", () => {
    state.user.current = { uid: "userA" };
    const { result, rerender } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "userA");
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 5 });
    });
    state.user.current = null;
    rerender();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(state.setDoc).not.toHaveBeenCalled();
    expect(result.current.wellness.status).toBe("loading");
  });

  it("4c captured-uid: timer-fired flush uses queued uid even after user mutation", () => {
    state.user.current = { uid: "userA" };
    const { result } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "userA");
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 5 });
    });
    // Mutate the user ref WITHOUT triggering a re-render. The
    // [user]-effect cleanup does NOT fire.
    state.user.current = { uid: "userB" };
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(state.setDoc).toHaveBeenCalledTimes(1);
    const ref = state.setDoc.mock.calls[0][0] as { path: string };
    expect(ref.path).toContain("userA");
    expect(ref.path).not.toContain("userB");
  });

  it("4c captured-uid: unmount-flush uses queued uid even after user mutation", () => {
    state.user.current = { uid: "userA" };
    const { result, unmount } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "userA");
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 5 });
    });
    state.user.current = { uid: "userB" };
    unmount();
    expect(state.setDoc).toHaveBeenCalledTimes(1);
    const ref = state.setDoc.mock.calls[0][0] as { path: string };
    expect(ref.path).toContain("userA");
    expect(ref.path).not.toContain("userB");
  });

  it("4d no-user no-op: setWellnessEntry / setPerformanceEntry are no-ops when signed out", () => {
    state.user.current = null;
    const { result } = renderHook(() => useData(), { wrapper });
    expect(() => {
      act(() => {
        result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 5 });
        result.current.setPerformanceEntry(WELLNESS_DATE, {
          metrics: { goals: 3 },
        });
      });
    }).not.toThrow();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(state.setDoc).not.toHaveBeenCalled();
    expect(result.current.wellness.status).toBe("loading");
    expect(result.current.performance.status).toBe("loading");
  });

  it("4e user A -> user B switch: pending discarded, no setDoc, fresh subscribe", () => {
    state.user.current = { uid: "userA" };
    const { result, rerender } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "userA");
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 5 });
    });
    state.user.current = { uid: "userB" };
    rerender();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(state.setDoc).not.toHaveBeenCalled();
    // wellness resets to loading until B's snapshot lands.
    expect(result.current.wellness.status).toBe("loading");
    emit(latestSub(state.wellnessSubs), [
      {
        path: `users/userB/wellnessEntries/${WELLNESS_DATE}`,
        data: {
          version: 1,
          date: WELLNESS_DATE,
          hydration: 1,
          sleepTime: 0,
          sleepEfficiency: 0,
          protein: 0,
          leanMass: 0,
          availability: FULL_AVAILABILITY,
        },
      },
    ]);
    expect(result.current.wellness.status).toBe("loaded");
    if (result.current.wellness.status === "loaded") {
      expect(result.current.wellness.entries[0].hydration).toBe(1);
    }
  });

  it("4f midnight rotation flushes pending writes (does not lose mid-debounce typing)", () => {
    // User starts typing 300ms before local midnight; debounce is 500ms.
    // The midnight floorISO rotation fires (re-issuing the listener
    // subscription) BEFORE the debounce flushes. The fix: rotation flushes
    // pending first, so the subscription cleanup has nothing to discard.
    vi.setSystemTime(new Date("2026-04-29T23:59:59.700"));
    state.user.current = { uid: "u1" };
    const wellnessSubsBefore = state.wellnessSubs.length;
    const { result } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "u1");
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 5 });
      result.current.setPerformanceEntry(WELLNESS_DATE, {
        metrics: { goals: 3 },
      });
    });
    expect(state.setDoc).not.toHaveBeenCalled();
    // Advance past midnight (300ms) but NOT past the 500ms debounce.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    // Both pending writes were flushed by the rotation hook.
    expect(state.setDoc).toHaveBeenCalledTimes(2);
    const calls = state.setDoc.mock.calls.map((c) => c[1]);
    expect(calls).toContainEqual(
      expect.objectContaining({ hydration: 5, date: WELLNESS_DATE }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        metrics: { goals: 3 },
        date: WELLNESS_DATE,
      }),
    );
    // Both flushes used the still-signed-in user's uid.
    for (const call of state.setDoc.mock.calls) {
      const ref = call[0] as { path: string };
      expect(ref.path).toContain("u1");
    }
    // And the listener actually rotated (new subscription issued past
    // the floor change), proving the test exercised the bug path.
    expect(state.wellnessSubs.length).toBeGreaterThan(
      wellnessSubsBefore + 1,
    );
  });

  it("omits version stamp when server snapshot is already at CURRENT", () => {
    // No-op stamp avoidance: when the server doc is already at our
    // CURRENT_*_VERSION, partial writes should not include `version`
    // in the setDoc payload (no behavior change, just less write-amp).
    const { result } = renderHook(() => useData(), { wrapper });
    emit(latestSub(state.wellnessSubs), [
      {
        path: `users/u1/wellnessEntries/${WELLNESS_DATE}`,
        data: {
          version: 1, // === CURRENT_WELLNESS_ENTRY_VERSION
          date: WELLNESS_DATE,
          hydration: 4,
          sleepTime: 8,
          sleepEfficiency: 85,
          protein: 1.5,
          leanMass: 60,
          availability: FULL_AVAILABILITY,
        },
      },
    ]);
    emit(latestSub(state.performanceSubs), []);
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 6 });
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(state.setDoc).toHaveBeenCalledTimes(1);
    const payload = state.setDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.hydration).toBe(6);
    expect(payload.date).toBe(WELLNESS_DATE);
    expect("version" in payload).toBe(false);
  });

  it("stale client does not downgrade version when server is ahead of CURRENT", () => {
    // Regression for the cross-version coexistence hazard: a stale tab
    // running an older schema must not roll `version` backward on a
    // doc the newer tab just stamped at a higher version. The raw
    // server version is cached pre-migration so the downgrade guard
    // works even when the stale client cannot migrate (and therefore
    // cannot render) the doc.
    const { result } = renderHook(() => useData(), { wrapper });
    emit(latestSub(state.wellnessSubs), [
      {
        path: `users/u1/wellnessEntries/${WELLNESS_DATE}`,
        data: {
          version: 5, // far ahead of this client's CURRENT
          date: WELLNESS_DATE,
          hydration: 4,
        },
      },
    ]);
    emit(latestSub(state.performanceSubs), []);
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 6 });
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(state.setDoc).toHaveBeenCalledTimes(1);
    const payload = state.setDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.hydration).toBe(6);
    expect("version" in payload).toBe(false);
  });

  it("Strict-Mode mount->unmount->remount cycle does not emit empty setDoc", () => {
    const { unmount } = renderHook(() => useData(), { wrapper });
    unmount();
    renderHook(() => useData(), { wrapper });
    expect(state.setDoc).not.toHaveBeenCalled();
  });
});

describe("DataContext optimistic merge memo", () => {
  beforeEach(() => {
    state.user.current = { uid: "u1" };
    vi.useFakeTimers();
  });

  it("6 setWellnessEntry exposes the partial synchronously before flush", () => {
    const { result } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "u1");
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 5 });
    });
    if (result.current.wellness.status !== "loaded") {
      throw new Error("expected loaded");
    }
    const entry = result.current.wellness.entries.find(
      (e) => e.date === WELLNESS_DATE,
    );
    expect(entry?.hydration).toBe(5);
    expect(state.setDoc).not.toHaveBeenCalled();
  });

  it("6b performance optimistic merge preserves established metrics", () => {
    const { result } = renderHook(() => useData(), { wrapper });
    emit(latestSub(state.wellnessSubs), []);
    emit(latestSub(state.performanceSubs), [
      {
        path: `users/u1/performanceEntries/${WELLNESS_DATE}`,
        data: {
          version: 1,
          date: WELLNESS_DATE,
          metrics: { wins: 5, losses: 2, goals: 4 },
        },
      },
    ]);
    expect(result.current.performance.status).toBe("loaded");
    act(() => {
      result.current.setPerformanceEntry(WELLNESS_DATE, {
        metrics: { goals: 7 },
      });
    });
    if (result.current.performance.status !== "loaded") {
      throw new Error("expected loaded");
    }
    const entry = result.current.performance.entries.find(
      (e) => e.date === WELLNESS_DATE,
    );
    expect(entry?.metrics).toEqual({ wins: 5, losses: 2, goals: 7 });
  });

  it("6c optimistic UI is not gated on initial server load", () => {
    // Server never settles - we never call .emit() on the wellness
    // subscription. The optimistic value must still surface.
    const { result } = renderHook(() => useData(), { wrapper });
    expect(result.current.wellness.status).toBe("loading");
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 5 });
    });
    expect(result.current.wellness.status).toBe("loaded");
    if (result.current.wellness.status === "loaded") {
      const entry = result.current.wellness.entries.find(
        (e) => e.date === WELLNESS_DATE,
      );
      expect(entry?.hydration).toBe(5);
    }
    expect(result.current.performance.status).toBe("loading");
    act(() => {
      result.current.setPerformanceEntry(WELLNESS_DATE, {
        metrics: { goals: 3 },
      });
    });
    expect(result.current.performance.status).toBe("loaded");
  });
});

describe("DataContext reconciliation against onSnapshot", () => {
  beforeEach(() => {
    state.user.current = { uid: "u1" };
    vi.useFakeTimers();
  });

  it("7a primitive fields: drops confirmed, keeps mid-flight", () => {
    const { result } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "u1");
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, {
        hydration: 5,
        sleepTime: 7,
      });
    });
    emit(latestSub(state.wellnessSubs), [
      {
        path: `users/u1/wellnessEntries/${WELLNESS_DATE}`,
        data: {
          version: 1,
          date: WELLNESS_DATE,
          hydration: 5,
          sleepTime: 0,
          sleepEfficiency: 0,
          protein: 0,
          leanMass: 0,
          availability: FULL_AVAILABILITY,
        },
      },
    ]);
    if (result.current.wellness.status !== "loaded") {
      throw new Error("expected loaded");
    }
    const entry = result.current.wellness.entries.find(
      (e) => e.date === WELLNESS_DATE,
    );
    expect(entry?.hydration).toBe(5);
    expect(entry?.sleepTime).toBe(7);
  });

  it("7b availability object: deep equality drops confirmed even with fresh reference", () => {
    const { result } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "u1");
    const availability = {
      practiceHeld: false,
      practiceParticipation: null,
      gameHeld: true,
      gameParticipation: "played",
    } as const;
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, {
        availability: { ...availability },
      });
    });
    emit(latestSub(state.wellnessSubs), [
      {
        path: `users/u1/wellnessEntries/${WELLNESS_DATE}`,
        data: {
          version: 1,
          date: WELLNESS_DATE,
          hydration: 0,
          sleepTime: 0,
          sleepEfficiency: 0,
          protein: 0,
          leanMass: 0,
          availability: { ...availability },
        },
      },
    ]);
    // After reconciliation, pending availability should be dropped.
    // Now a snapshot with a DIFFERENT availability lands; if pending
    // had not been dropped, the optimistic overlay would still apply
    // the OLD value and mask the server's new value.
    const newAvail = {
      practiceHeld: true,
      practiceParticipation: "played",
      gameHeld: true,
      gameParticipation: "played",
    } as const;
    emit(latestSub(state.wellnessSubs), [
      {
        path: `users/u1/wellnessEntries/${WELLNESS_DATE}`,
        data: {
          version: 1,
          date: WELLNESS_DATE,
          hydration: 0,
          sleepTime: 0,
          sleepEfficiency: 0,
          protein: 0,
          leanMass: 0,
          availability: { ...newAvail },
        },
      },
    ]);
    if (result.current.wellness.status !== "loaded") {
      throw new Error("expected loaded");
    }
    const entry = result.current.wellness.entries.find(
      (e) => e.date === WELLNESS_DATE,
    );
    expect(entry?.availability).toEqual(newAvail);
  });

  it("7c performance.metrics map: per-key reconciliation", () => {
    const { result } = renderHook(() => useData(), { wrapper });
    emit(latestSub(state.wellnessSubs), []);
    emit(latestSub(state.performanceSubs), []);
    expect(result.current.performance.status).toBe("loaded");
    act(() => {
      result.current.setPerformanceEntry(WELLNESS_DATE, {
        metrics: { goals: 2, assists: 1 },
      });
    });
    // Server confirms goals only.
    emit(latestSub(state.performanceSubs), [
      {
        path: `users/u1/performanceEntries/${WELLNESS_DATE}`,
        data: {
          version: 1,
          date: WELLNESS_DATE,
          metrics: { goals: 2 },
        },
      },
    ]);
    // After reconciliation, pending metrics should retain only
    // assists. A second snapshot replacing assists with 99 is masked
    // by the optimistic overlay (assists pending=1 wins).
    emit(latestSub(state.performanceSubs), [
      {
        path: `users/u1/performanceEntries/${WELLNESS_DATE}`,
        data: {
          version: 1,
          date: WELLNESS_DATE,
          metrics: { goals: 2, assists: 99 },
        },
      },
    ]);
    if (result.current.performance.status !== "loaded") {
      throw new Error("expected loaded");
    }
    const entry = result.current.performance.entries.find(
      (e) => e.date === WELLNESS_DATE,
    );
    expect(entry?.metrics?.assists).toBe(1);
    expect(entry?.metrics?.goals).toBe(2);
  });

  it("7d stale server: mid-flight value is preserved", () => {
    const { result } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "u1");
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 6 });
    });
    emit(latestSub(state.wellnessSubs), [
      {
        path: `users/u1/wellnessEntries/${WELLNESS_DATE}`,
        data: {
          version: 1,
          date: WELLNESS_DATE,
          hydration: 5,
          sleepTime: 0,
          sleepEfficiency: 0,
          protein: 0,
          leanMass: 0,
          availability: FULL_AVAILABILITY,
        },
      },
    ]);
    if (result.current.wellness.status !== "loaded") {
      throw new Error("expected loaded");
    }
    const entry = result.current.wellness.entries.find(
      (e) => e.date === WELLNESS_DATE,
    );
    expect(entry?.hydration).toBe(6);
  });
});

describe("DataProvider component", () => {
  it("renders children", () => {
    state.user.current = { uid: "u1" };
    function Child() {
      const [v] = useState("ok");
      return createElement("div", { "data-testid": "child" }, v);
    }
    const { getByTestId } = render(
      createElement(DataProvider, null, createElement(Child)),
    );
    expect(getByTestId("child").textContent).toBe("ok");
  });
});
