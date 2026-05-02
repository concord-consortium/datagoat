// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";

// Mock firebase before any imports that touch it.
const onSnapshotMock = vi.fn();
const setDocMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined),
);
const updateDocMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined),
);

vi.mock("firebase/firestore", () => ({
  doc: () => ({ path: "users/u1/profile/main" }),
  onSnapshot: (...args: unknown[]) => {
    return onSnapshotMock(...args);
  },
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}));

// Hoisted handle so individual tests can swap in a throwing migration to
// exercise the migration-error branch without registering a real migration
// (which would leak across test files via the shared registry).
const migrateDocumentMock = vi.hoisted(() => vi.fn());
vi.mock("../migrations", () => ({
  migrateDocument: (...args: unknown[]) => migrateDocumentMock(...args),
}));

vi.mock("../firebase", () => ({
  auth: {},
  db: {},
}));

vi.mock("../utils/logError", () => ({
  logError: vi.fn(),
}));

import { UserProvider, useUser } from "./UserContext";

// Drive the auth user via a controlled mock.
let mockUser: { uid: string; email: string } | null = null;
vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return createElement(UserProvider, null, children);
}

describe("UserContext loadState transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    // Default migration: pass through the input. Individual tests can override
    // with mockImplementationOnce to throw.
    migrateDocumentMock.mockImplementation((_type: string, data: unknown) => data);
    setDocMock.mockImplementation(async () => undefined);
    updateDocMock.mockImplementation(async () => undefined);
  });

  it("starts in 'loading' when no user is signed in", () => {
    const { result } = renderHook(() => useUser(), { wrapper });
    expect(result.current.loadState.status).toBe("loading");
    expect(onSnapshotMock).not.toHaveBeenCalled();
  });

  it("transitions loading -> missing when the snapshot resolves with no doc", async () => {
    mockUser = { uid: "u1", email: "u@example.com" };
    let snapshotCb: ((s: unknown) => void) | null = null;
    onSnapshotMock.mockImplementation(
      (_ref: unknown, cb: (s: unknown) => void) => {
        snapshotCb = cb;
        return () => undefined;
      },
    );

    const { result } = renderHook(() => useUser(), { wrapper });
    expect(result.current.loadState.status).toBe("loading");

    act(() => {
      snapshotCb!({
        exists: () => false,
        data: () => undefined,
      });
    });

    await waitFor(() =>
      expect(result.current.loadState.status).toBe("missing"),
    );
  });

  it("transitions loading -> error{kind:'subscription'} when the snapshot subscription errors", async () => {
    mockUser = { uid: "u1", email: "u@example.com" };
    let errorCb: ((e: unknown) => void) | null = null;
    onSnapshotMock.mockImplementation(
      (
        _ref: unknown,
        _next: (s: unknown) => void,
        onError: (e: unknown) => void,
      ) => {
        errorCb = onError;
        return () => undefined;
      },
    );

    const { result } = renderHook(() => useUser(), { wrapper });
    expect(result.current.loadState.status).toBe("loading");

    act(() => {
      errorCb!(new Error("permission-denied"));
    });

    await waitFor(() =>
      expect(result.current.loadState.status).toBe("error"),
    );
    // Load-bearing assertion: a snapshot error must NOT collapse to
    // 'missing'. ProtectedRoute would otherwise redirect a real user to
    // /profile and submit-merge over their data.
    expect(result.current.loadState.status).not.toBe("missing");
    if (result.current.loadState.status === "error") {
      expect(result.current.loadState.kind).toBe("subscription");
    }
  });

  it("transitions loading -> error{kind:'migration'} when migrateDocument throws on an existing doc", async () => {
    mockUser = { uid: "u1", email: "u@example.com" };
    let snapshotCb: ((s: unknown) => void) | null = null;
    onSnapshotMock.mockImplementation(
      (_ref: unknown, cb: (s: unknown) => void) => {
        snapshotCb = cb;
        return () => undefined;
      },
    );
    migrateDocumentMock.mockImplementationOnce(() => {
      throw new Error("migration boom");
    });

    const { result } = renderHook(() => useUser(), { wrapper });
    expect(result.current.loadState.status).toBe("loading");

    act(() => {
      snapshotCb!({
        exists: () => true,
        data: () => ({ version: 1, fullName: "T" }),
      });
    });

    await waitFor(() =>
      expect(result.current.loadState.status).toBe("error"),
    );
    // Load-bearing assertion: a migration throw on the singleton profile
    // doc must NOT collapse to 'missing'. ProtectedRoute would otherwise
    // redirect to /profile and the onboarding submit (setDoc merge:true)
    // would clobber the unmigrated doc.
    expect(result.current.loadState.status).not.toBe("missing");
    if (result.current.loadState.status === "error") {
      expect(result.current.loadState.kind).toBe("migration");
    }
  });

  it("retry() re-subscribes after an error", async () => {
    mockUser = { uid: "u1", email: "u@example.com" };
    let nextCb: ((s: unknown) => void) | null = null;
    let errorCb: ((e: unknown) => void) | null = null;
    let subscribeCount = 0;
    onSnapshotMock.mockImplementation(
      (
        _ref: unknown,
        next: (s: unknown) => void,
        onError: (e: unknown) => void,
      ) => {
        subscribeCount += 1;
        nextCb = next;
        errorCb = onError;
        return () => undefined;
      },
    );

    const { result } = renderHook(() => useUser(), { wrapper });
    expect(subscribeCount).toBe(1);

    act(() => {
      errorCb!(new Error("net"));
    });
    await waitFor(() =>
      expect(result.current.loadState.status).toBe("error"),
    );

    act(() => {
      result.current.retry();
    });
    expect(subscribeCount).toBe(2);
    await waitFor(() =>
      expect(result.current.loadState.status).toBe("loading"),
    );

    act(() => {
      nextCb!({ exists: () => false, data: () => undefined });
    });
    await waitFor(() =>
      expect(result.current.loadState.status).toBe("missing"),
    );
  });

  it("transitions loading -> loaded when the snapshot resolves with a doc", async () => {
    mockUser = { uid: "u1", email: "u@example.com" };
    let snapshotCb: ((s: unknown) => void) | null = null;
    onSnapshotMock.mockImplementation(
      (_ref: unknown, cb: (s: unknown) => void) => {
        snapshotCb = cb;
        return () => undefined;
      },
    );

    const { result } = renderHook(() => useUser(), { wrapper });
    expect(result.current.loadState.status).toBe("loading");

    act(() => {
      snapshotCb!({
        exists: () => true,
        data: () => ({
          version: 1,
          fullName: "Test User",
          email: "u@example.com",
          nickname: "tester",
          age: 18,
          heightFt: 5,
          heightIn: 9,
          weight: 150,
          gender: "male",
          athleteType: "endurance",
          competitionTerm: "game",
          trackedWellnessMetrics: [],
          trackedPerformanceMetrics: [],
          profileComplete: true,
          trackingSetupComplete: false,
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.loadState.status).toBe("loaded");
      if (result.current.loadState.status === "loaded") {
        expect(result.current.loadState.profile.fullName).toBe("Test User");
      }
    });
  });

  it("setTrackedMetrics falls back to setDoc(merge) when the doc is missing (cross-tab race)", async () => {
    mockUser = { uid: "u1", email: "u@example.com" };
    onSnapshotMock.mockImplementation(
      (_ref: unknown, cb: (s: unknown) => void) => {
        // Pretend the doc was loaded so the consumer's gate passed; the
        // race is that it's then deleted before the write reaches Firestore.
        cb({
          exists: () => true,
          data: () => ({
            version: 1,
            trackedWellnessMetrics: ["a", "b"],
            trackedPerformanceMetrics: [],
          }),
        });
        return () => undefined;
      },
    );
    updateDocMock.mockImplementationOnce(async () => {
      const err = new Error("No document to update") as Error & {
        code: string;
      };
      err.code = "not-found";
      throw err;
    });

    const { result } = renderHook(() => useUser(), { wrapper });
    await waitFor(() =>
      expect(result.current.loadState.status).toBe("loaded"),
    );

    await act(async () => {
      await result.current.setTrackedMetrics("wellness", ["b", "a"]);
    });

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [, payload, options] = setDocMock.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      { merge: boolean },
    ];
    expect(payload).toEqual({
      trackedWellnessMetrics: ["b", "a"],
      version: 1,
    });
    expect(options).toEqual({ merge: true });
  });

  it("setTrackedMetrics rethrows non-'not-found' errors", async () => {
    mockUser = { uid: "u1", email: "u@example.com" };
    onSnapshotMock.mockImplementation(
      (_ref: unknown, cb: (s: unknown) => void) => {
        cb({
          exists: () => true,
          data: () => ({
            version: 1,
            trackedWellnessMetrics: [],
            trackedPerformanceMetrics: [],
          }),
        });
        return () => undefined;
      },
    );
    updateDocMock.mockImplementationOnce(async () => {
      const err = new Error("permission denied") as Error & { code: string };
      err.code = "permission-denied";
      throw err;
    });

    const { result } = renderHook(() => useUser(), { wrapper });
    await waitFor(() =>
      expect(result.current.loadState.status).toBe("loaded"),
    );

    await expect(
      result.current.setTrackedMetrics("wellness", ["x"]),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(setDocMock).not.toHaveBeenCalled();
  });
});
