// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";

const { onAuthStateChangedMock } = vi.hoisted(() => ({
  onAuthStateChangedMock: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: onAuthStateChangedMock,
  signOut: vi.fn(async () => undefined),
}));

vi.mock("../firebase", () => ({
  auth: {},
}));

import { AuthProvider, useAuth } from "./AuthContext";

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function fakeUser(overrides: Partial<User>): User {
  return {
    uid: "u1",
    emailVerified: false,
    metadata: {},
    ...overrides,
  } as unknown as User;
}

describe("AuthContext.isEmailVerified derivation", () => {
  let emit: (u: User | null) => void = () => {};

  beforeEach(() => {
    onAuthStateChangedMock.mockReset();
    onAuthStateChangedMock.mockImplementation((_auth, cb) => {
      emit = cb;
      return () => undefined;
    });
  });

  it("isEmailVerified is true when user.emailVerified is true (OAuth happy path)", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => emit(fakeUser({ emailVerified: true })));
    expect(result.current.isEmailVerified).toBe(true);
  });

  it("isEmailVerified is false when user.emailVerified is false (unverified email signup)", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => emit(fakeUser({ emailVerified: false })));
    expect(result.current.isEmailVerified).toBe(false);
  });

  it("isEmailVerified is false when no user is signed in", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => emit(null));
    expect(result.current.isEmailVerified).toBe(false);
  });
});
