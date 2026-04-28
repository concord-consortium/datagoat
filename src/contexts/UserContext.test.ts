// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";

// Mock firebase before any imports that touch it.
const onSnapshotMock = vi.fn();

vi.mock("firebase/firestore", () => ({
  doc: () => ({ path: "users/u1/profile/main" }),
  onSnapshot: (...args: unknown[]) => {
    return onSnapshotMock(...args);
  },
  setDoc: async () => undefined,
  updateDoc: async () => undefined,
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
});
