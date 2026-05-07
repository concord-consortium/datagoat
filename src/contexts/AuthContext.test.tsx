// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";

const { onAuthStateChangedMock } = vi.hoisted(() => ({
  onAuthStateChangedMock: vi.fn(),
}));

// AuthContext now imports `isEmailVerifiedOrTrustedProvider` from
// authProviders, which constructs Google/Facebook providers at module
// load. Stub those alongside the auth mocks so the module graph loads
// cleanly under jsdom.
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: onAuthStateChangedMock,
  signOut: vi.fn(async () => undefined),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: function GoogleAuthProvider() {
    return {};
  },
  FacebookAuthProvider: Object.assign(
    function FacebookAuthProvider() {
      return { addScope: vi.fn() };
    },
    {
      credentialFromError: vi.fn(),
    },
  ),
}));

vi.mock("../firebase", () => ({
  auth: {},
  db: {},
  getAnalyticsLazy: vi.fn(() => Promise.resolve(null)),
}));

import { AuthProvider, useAuth } from "./AuthContext";

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function fakeUser(overrides: Partial<User>): User {
  return {
    uid: "u1",
    emailVerified: false,
    // metadata.creationTime day-floor math is exercised in VerificationBanner.test.tsx; AuthContext does not read it.
    metadata: {},
    ...overrides,
  } as unknown as User;
}

describe("AuthContext.isEmailVerifiedOrTrusted derivation", () => {
  let emit: (u: User | null) => void = () => {};

  beforeEach(() => {
    onAuthStateChangedMock.mockReset();
    onAuthStateChangedMock.mockImplementation((_auth, cb) => {
      emit = cb;
      return () => undefined;
    });
  });

  it("is true when user.emailVerified is true (Google OAuth happy path)", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => emit(fakeUser({ emailVerified: true })));
    expect(result.current.isEmailVerifiedOrTrusted).toBe(true);
  });

  it("is true when user signed in via Facebook (trusted provider) even if emailVerified is false", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() =>
      emit(
        fakeUser({
          emailVerified: false,
          email: "fb@example.com",
          providerData: [
            { providerId: "facebook.com" } as User["providerData"][number],
          ],
        }),
      ),
    );
    expect(result.current.isEmailVerifiedOrTrusted).toBe(true);
  });

  it("is false when user.emailVerified is false and no trusted provider (password signup)", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() =>
      emit(
        fakeUser({
          emailVerified: false,
          email: "u@example.com",
          providerData: [
            { providerId: "password" } as User["providerData"][number],
          ],
        }),
      ),
    );
    expect(result.current.isEmailVerifiedOrTrusted).toBe(false);
  });

  it("is false when no user is signed in", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    act(() => emit(null));
    expect(result.current.isEmailVerifiedOrTrusted).toBe(false);
  });
});
