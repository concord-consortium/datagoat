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

import {
  signInWithProvider,
  extractBlockedNoEmailMessage,
} from "./authProviders";

const FAKE_PROVIDER = { providerId: "facebook.com" } as never;

function makeAuthError(
  code: string,
  customData?: { email?: unknown },
  message = "",
): AuthError {
  return { code, message, customData, name: "FirebaseError" } as AuthError;
}

describe("extractBlockedNoEmailMessage", () => {
  it("sentinel followed by copy -> returns trimmed copy", () => {
    const err = makeAuthError(
      "auth/internal-error",
      undefined,
      "Firebase: [BLOCKED_NO_EMAIL] Facebook didn't share your email. Try Google or email/password.",
    );
    expect(extractBlockedNoEmailMessage(err)).toBe(
      "Facebook didn't share your email. Try Google or email/password.",
    );
  });

  it("sentinel with nothing after -> returns fallback copy", () => {
    const err = makeAuthError(
      "auth/internal-error",
      undefined,
      "Firebase: [BLOCKED_NO_EMAIL]   ",
    );
    expect(extractBlockedNoEmailMessage(err)).toBe(
      "Your sign-in was rejected. Try a different method.",
    );
  });

  it("no sentinel in message -> returns null", () => {
    const err = makeAuthError(
      "auth/internal-error",
      undefined,
      "Firebase: An internal error occurred.",
    );
    expect(extractBlockedNoEmailMessage(err)).toBeNull();
  });

  it("non-string message -> returns null", () => {
    const err = {
      code: "auth/internal-error",
      name: "FirebaseError",
      message: undefined,
    } as unknown as AuthError;
    expect(extractBlockedNoEmailMessage(err)).toBeNull();
  });
});

describe("signInWithProvider auth/internal-error branch", () => {
  beforeEach(() => {
    signInWithPopupMock.mockReset();
    credentialFromErrorMock.mockReset();
    logErrorMock.mockReset();
  });

  it("sentinel present -> returns {kind:'blocked-no-email'} with extracted copy and does not log", async () => {
    signInWithPopupMock.mockRejectedValue(
      makeAuthError(
        "auth/internal-error",
        undefined,
        "Firebase: [BLOCKED_NO_EMAIL] Facebook didn't share your email.",
      ),
    );

    const result = await signInWithProvider(FAKE_PROVIDER);

    expect(result).toEqual({
      ok: false,
      kind: "blocked-no-email",
      message: "Facebook didn't share your email.",
    });
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("sentinel absent -> falls through to {kind:'other'} and logs", async () => {
    signInWithPopupMock.mockRejectedValue(
      makeAuthError(
        "auth/internal-error",
        undefined,
        "Firebase: An internal error occurred.",
      ),
    );

    const result = await signInWithProvider(FAKE_PROVIDER);

    expect(result).toEqual({
      ok: false,
      kind: "other",
      code: "auth/internal-error",
    });
    expect(logErrorMock).toHaveBeenCalled();
  });
});

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
