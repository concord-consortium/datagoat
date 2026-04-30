// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthError, AuthCredential } from "firebase/auth";

const { signInWithPopupMock, credentialFromErrorMock, logErrorMock } =
  vi.hoisted(() => ({
    signInWithPopupMock: vi.fn(),
    credentialFromErrorMock: vi.fn(),
    logErrorMock: vi.fn(),
  }));

vi.mock("firebase/auth", async () => {
  const actual =
    await vi.importActual<typeof import("firebase/auth")>("firebase/auth");
  return {
    ...actual,
    signInWithPopup: (...args: unknown[]) => signInWithPopupMock(...args),
    FacebookAuthProvider: Object.assign(
      function FacebookAuthProvider() {
        return { addScope: vi.fn() };
      },
      {
        credentialFromError: (...args: unknown[]) =>
          credentialFromErrorMock(...args),
      },
    ),
    GoogleAuthProvider: function GoogleAuthProvider() {
      return {};
    },
  };
});

vi.mock("../../firebase", () => ({
  auth: {},
  db: {},
  getAnalyticsLazy: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../../utils/logError", () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}));

import { signInWithProvider } from "./authProviders";

const FAKE_PROVIDER = { providerId: "facebook.com" } as never;

function makeAuthError(
  code: string,
  customData?: { email?: unknown },
  message = "",
): AuthError {
  return { code, message, customData, name: "FirebaseError" } as AuthError;
}

describe("signInWithProvider account-collision branch", () => {
  beforeEach(() => {
    signInWithPopupMock.mockReset();
    credentialFromErrorMock.mockReset();
    logErrorMock.mockReset();
  });

  it("missing customData.email -> falls through to {kind:'other'} and logs collisionMissingEmail", async () => {
    signInWithPopupMock.mockRejectedValue(
      makeAuthError("auth/account-exists-with-different-credential", undefined),
    );
    credentialFromErrorMock.mockReturnValue({
      providerId: "facebook.com",
    } as AuthCredential);

    const result = await signInWithProvider(FAKE_PROVIDER);

    expect(result).toEqual({
      ok: false,
      kind: "other",
      code: "auth/account-exists-with-different-credential",
    });
    const stages = logErrorMock.mock.calls.map(
      (call) => (call[1] as { stage?: string } | undefined)?.stage,
    );
    expect(stages).toContain("signInWithProvider.collisionMissingEmail");
  });

  it("non-string customData.email -> falls through to {kind:'other'}", async () => {
    signInWithPopupMock.mockRejectedValue(
      makeAuthError("auth/account-exists-with-different-credential", {
        email: 42,
      }),
    );
    credentialFromErrorMock.mockReturnValue({
      providerId: "facebook.com",
    } as AuthCredential);

    const result = await signInWithProvider(FAKE_PROVIDER);

    expect(result).toEqual({
      ok: false,
      kind: "other",
      code: "auth/account-exists-with-different-credential",
    });
  });

  it("valid customData.email -> returns account-collision with email + credential", async () => {
    const credential = { providerId: "facebook.com" } as AuthCredential;
    signInWithPopupMock.mockRejectedValue(
      makeAuthError("auth/account-exists-with-different-credential", {
        email: "user@example.com",
      }),
    );
    credentialFromErrorMock.mockReturnValue(credential);

    const result = await signInWithProvider(FAKE_PROVIDER);

    expect(result).toEqual({
      ok: false,
      kind: "account-collision",
      email: "user@example.com",
      pendingCredential: credential,
    });
    const stages = logErrorMock.mock.calls.map(
      (call) => (call[1] as { stage?: string } | undefined)?.stage,
    );
    expect(stages).not.toContain("signInWithProvider.collisionMissingEmail");
  });
});
