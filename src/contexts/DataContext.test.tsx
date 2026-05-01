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
import { logError } from "../utils/logError";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(DataProvider, null, children);
}

function emit(
  sub: MockSubscriptionHandle | undefined,
  docs: MockSnapshotDoc[],
  metadata?: { hasPendingWrites: boolean },
) {
  if (!sub) throw new Error("no active subscription");
  act(() => {
    sub.emit(docs, metadata);
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

  it("rejects out-of-window, future, and malformed dates: no setDoc, no overlay, logError fires", () => {
    const { result } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "u1");
    vi.mocked(logError).mockClear();
    // 400 days ago is past the 365-day listener floor; the snapshot
    // would never round-trip the write so the optimistic entry would
    // be stuck forever.
    const farPast = new Date();
    farPast.setHours(0, 0, 0, 0);
    farPast.setDate(farPast.getDate() - 400);
    const farPastIso = `${farPast.getFullYear()}-${String(farPast.getMonth() + 1).padStart(2, "0")}-${String(farPast.getDate()).padStart(2, "0")}`;
    const future = new Date();
    future.setHours(0, 0, 0, 0);
    future.setDate(future.getDate() + 5);
    const futureIso = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
    act(() => {
      result.current.setWellnessEntry(farPastIso, { hydration: 5 });
      result.current.setWellnessEntry(futureIso, { hydration: 5 });
      result.current.setWellnessEntry("not-a-date", { hydration: 5 });
      result.current.setPerformanceEntry(farPastIso, {
        metrics: { goals: 1 },
      });
      result.current.setPerformanceEntry(futureIso, {
        metrics: { goals: 1 },
      });
      result.current.setPerformanceEntry("2026-13-40", {
        metrics: { goals: 1 },
      });
    });
    if (result.current.wellness.status !== "loaded") {
      throw new Error("expected loaded");
    }
    if (result.current.performance.status !== "loaded") {
      throw new Error("expected loaded");
    }
    expect(result.current.wellness.entries).toEqual([]);
    expect(result.current.performance.entries).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(state.setDoc).not.toHaveBeenCalled();
    expect(vi.mocked(logError)).toHaveBeenCalledTimes(6);
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

  it("creation: partial availability write expands to full null-defaulted sub-keys", () => {
    // Without this, setDoc(merge:true) of `{availability: {practiceHeld:true}}`
    // on a brand-new doc would leave the other sub-fields absent on
    // disk - read back as undefined, which silently passes the
    // availabilityFilled `!== null` guard and flips the wellness chip
    // to "all" prematurely.
    const { result } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "u1");
    act(() => {
      // Cast: Partial<WellnessEntry> is shallow, so this exercises the
      // runtime-deeply-partial path that reduceWellnessPartial can also
      // produce.
      result.current.setWellnessEntry(WELLNESS_DATE, {
        availability: { practiceHeld: true },
      } as Parameters<typeof result.current.setWellnessEntry>[1]);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(state.setDoc).toHaveBeenCalledTimes(1);
    const payload = state.setDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.availability).toEqual({
      practiceHeld: true,
      practiceParticipation: null,
      gameHeld: null,
      gameParticipation: null,
    });
    expect(payload.version).toBe(1);
  });

  it("upgrade path: partial availability write is NOT expanded (existing sub-keys preserved)", () => {
    // The existing doc may already have non-null sub-key values that
    // merge:true would overwrite with null. Stamping defaults is safe
    // only on creation.
    const { result } = renderHook(() => useData(), { wrapper });
    emit(latestSub(state.wellnessSubs), [
      {
        path: `users/u1/wellnessEntries/${WELLNESS_DATE}`,
        data: {
          // version below CURRENT triggers the upgrade-stamp path while
          // proving the doc exists on the server.
          version: 0,
          date: WELLNESS_DATE,
          availability: {
            practiceHeld: true,
            practiceParticipation: "played",
            gameHeld: false,
            gameParticipation: null,
          },
        },
      },
    ]);
    emit(latestSub(state.performanceSubs), []);
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, {
        availability: { practiceHeld: false },
      } as Parameters<typeof result.current.setWellnessEntry>[1]);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(state.setDoc).toHaveBeenCalledTimes(1);
    const payload = state.setDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.availability).toEqual({ practiceHeld: false });
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

  it("7b' availability sub-keys: per-sub-key reconciliation drops only confirmed fields", () => {
    const { result } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "u1");
    // Pending payload sets only two of the four availability sub-keys.
    // A future caller (or a refactor that drives one Y/N input at a
    // time) could legitimately produce this shape; the reducer must
    // not stick the partial across snapshots.
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, {
        availability: { practiceHeld: true, practiceParticipation: "played" },
      });
    });
    // Server confirms practiceHeld but NOT practiceParticipation.
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
          availability: {
            practiceHeld: true,
            practiceParticipation: null,
            gameHeld: null,
            gameParticipation: null,
          },
        },
      },
    ]);
    // Pending should retain only practiceParticipation. A second
    // snapshot replacing practiceParticipation with "dnp" stays masked
    // by the optimistic overlay (pending="played" wins).
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
          availability: {
            practiceHeld: true,
            practiceParticipation: "dnp",
            gameHeld: null,
            gameParticipation: null,
          },
        },
      },
    ]);
    if (result.current.wellness.status !== "loaded") {
      throw new Error("expected loaded");
    }
    const entry = result.current.wellness.entries.find(
      (e) => e.date === WELLNESS_DATE,
    );
    expect(entry?.availability.practiceParticipation).toBe("played");
    expect(entry?.availability.practiceHeld).toBe(true);
    // Now the server confirms practiceParticipation = "played" too.
    // After reconciliation pending is fully consumed, so a later
    // snapshot with a DIFFERENT practiceParticipation must surface.
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
          availability: {
            practiceHeld: true,
            practiceParticipation: "played",
            gameHeld: null,
            gameParticipation: null,
          },
        },
      },
    ]);
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
          availability: {
            practiceHeld: true,
            practiceParticipation: "dnp",
            gameHeld: null,
            gameParticipation: null,
          },
        },
      },
    ]);
    if (result.current.wellness.status !== "loaded") {
      throw new Error("expected loaded");
    }
    const after = result.current.wellness.entries.find(
      (e) => e.date === WELLNESS_DATE,
    );
    expect(after?.availability.practiceParticipation).toBe("dnp");
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

  it("7e cache snapshot with hasPendingWrites is skipped (pending preserved against self-mirror)", () => {
    // Persistent-cache + offline: onSnapshot fires from the cache
    // with metadata.hasPendingWrites === true, mirroring the local
    // optimistic write back at us. If reconciliation ran on this
    // snapshot, pending would drop because the cache "matches"
    // pending; a later server-side rejection would then surface the
    // pre-write server value with no optimistic state to fall back
    // on. The fix is a snapshot-level early return.
    const { result } = renderHook(() => useData(), { wrapper });
    driveLoaded(result, "u1");
    act(() => {
      result.current.setWellnessEntry(WELLNESS_DATE, { hydration: 5 });
    });
    // Cache mirror of the optimistic write. With the filter, this
    // snapshot is ignored - server state is not updated and pending
    // is not reconciled.
    emit(
      latestSub(state.wellnessSubs),
      [
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
      ],
      { hasPendingWrites: true },
    );
    // Server-acked snapshot lands later showing a DIFFERENT hydration
    // (simulates the queued write being rejected and a different
    // server value winning). Without the filter, pending would
    // already have been dropped by the cache snapshot above and this
    // value would surface; with the filter, pending survives the
    // cache snapshot and the optimistic value still wins.
    emit(latestSub(state.wellnessSubs), [
      {
        path: `users/u1/wellnessEntries/${WELLNESS_DATE}`,
        data: {
          version: 1,
          date: WELLNESS_DATE,
          hydration: 999,
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
