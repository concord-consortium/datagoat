// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthCredential, User } from "firebase/auth";

const {
  signInWithPopupMock,
  signInWithEmailAndPasswordMock,
  signOutMock,
  linkWithCredentialMock,
} = vi.hoisted(() => ({
  signInWithPopupMock: vi.fn(),
  signInWithEmailAndPasswordMock: vi.fn(),
  signOutMock: vi.fn(),
  linkWithCredentialMock: vi.fn(),
}));

vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>(
    "firebase/auth",
  );
  return {
    ...actual,
    signInWithPopup: (...args: unknown[]) => signInWithPopupMock(...args),
    signInWithEmailAndPassword: (...args: unknown[]) =>
      signInWithEmailAndPasswordMock(...args),
    signOut: (...args: unknown[]) => signOutMock(...args),
    linkWithCredential: (...args: unknown[]) => linkWithCredentialMock(...args),
  };
});

vi.mock("./authProviders", () => ({
  googleProvider: { id: "google" } as object,
  facebookProvider: { id: "facebook" } as object,
}));

vi.mock("../../firebase", () => ({
  auth: {},
  db: {},
  getAnalyticsLazy: vi.fn(() => Promise.resolve(null)),
}));

import { LinkAccountPanel } from "./LinkAccountPanel";

const EMAIL = "user@example.com";
const PENDING_CRED = {
  providerId: "facebook.com",
} as unknown as AuthCredential;

function renderPanel(
  overrides: {
    onLinked?: (u: User) => void;
    onCancel?: () => void;
  } = {},
) {
  const onLinked = overrides.onLinked ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();
  render(
    <LinkAccountPanel
      email={EMAIL}
      pendingCredential={PENDING_CRED}
      onLinked={onLinked}
      onCancel={onCancel}
    />,
  );
  return { onLinked, onCancel };
}

describe("LinkAccountPanel", () => {
  beforeEach(() => {
    signInWithPopupMock.mockReset();
    signInWithEmailAndPasswordMock.mockReset();
    signOutMock.mockReset();
    linkWithCredentialMock.mockReset();
  });

  it("Google re-auth with matching email -> linkWithCredential then onLinked", async () => {
    const user = userEvent.setup();
    const signedInUser = { uid: "u1", email: EMAIL } as User;
    const linkedUser = { uid: "u1", email: EMAIL } as User;
    signInWithPopupMock.mockResolvedValue({ user: signedInUser });
    linkWithCredentialMock.mockResolvedValue({ user: linkedUser });
    const { onLinked } = renderPanel();

    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    await waitFor(() => {
      expect(linkWithCredentialMock).toHaveBeenCalledWith(
        signedInUser,
        PENDING_CRED,
      );
      expect(onLinked).toHaveBeenCalledWith(linkedUser);
    });
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("Google re-auth with mismatched email -> signOut + mismatch copy, no link", async () => {
    const user = userEvent.setup();
    signInWithPopupMock.mockResolvedValue({
      user: { uid: "u2", email: "other@example.com" } as User,
    });
    signOutMock.mockResolvedValue(undefined);
    const { onLinked } = renderPanel();

    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/that account doesn't match user@example\.com/i),
      ).toBeInTheDocument(),
    );
    expect(signOutMock).toHaveBeenCalled();
    expect(linkWithCredentialMock).not.toHaveBeenCalled();
    expect(onLinked).not.toHaveBeenCalled();
  });

  it("Google re-auth mismatch + signOut rejects -> mismatch copy still rendered", async () => {
    const user = userEvent.setup();
    signInWithPopupMock.mockResolvedValue({
      user: { uid: "u2", email: "other@example.com" } as User,
    });
    signOutMock.mockRejectedValue(new Error("signOut failed"));
    const { onLinked } = renderPanel();

    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/that account doesn't match user@example\.com/i),
      ).toBeInTheDocument(),
    );
    expect(linkWithCredentialMock).not.toHaveBeenCalled();
    expect(onLinked).not.toHaveBeenCalled();
  });

  it("Google re-auth popup rejects -> error mapped through authErrorMessageFor", async () => {
    const user = userEvent.setup();
    signInWithPopupMock.mockRejectedValue({ code: "auth/popup-blocked" });
    const { onLinked } = renderPanel();

    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/sign-in popup was blocked/i),
      ).toBeInTheDocument(),
    );
    expect(linkWithCredentialMock).not.toHaveBeenCalled();
    expect(onLinked).not.toHaveBeenCalled();
  });

  it("password sign-in success -> linkWithCredential + onLinked", async () => {
    const user = userEvent.setup();
    const signedInUser = { uid: "u1", email: EMAIL } as User;
    const linkedUser = { uid: "u1", email: EMAIL } as User;
    signInWithEmailAndPasswordMock.mockResolvedValue({ user: signedInUser });
    linkWithCredentialMock.mockResolvedValue({ user: linkedUser });
    const { onLinked } = renderPanel();

    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.click(
      screen.getByRole("button", { name: /sign in to link/i }),
    );

    await waitFor(() => {
      expect(signInWithEmailAndPasswordMock).toHaveBeenCalledWith(
        {},
        EMAIL,
        "secret123",
      );
      expect(linkWithCredentialMock).toHaveBeenCalledWith(
        signedInUser,
        PENDING_CRED,
      );
      expect(onLinked).toHaveBeenCalledWith(linkedUser);
    });
  });

  it("password sign-in failure -> error mapped through authErrorMessageFor", async () => {
    const user = userEvent.setup();
    signInWithEmailAndPasswordMock.mockRejectedValue({
      code: "auth/wrong-password",
    });
    const { onLinked } = renderPanel();

    await user.type(screen.getByLabelText(/^password/i), "wrong-pw");
    await user.click(
      screen.getByRole("button", { name: /sign in to link/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/invalid email or password/i),
      ).toBeInTheDocument(),
    );
    expect(linkWithCredentialMock).not.toHaveBeenCalled();
    expect(onLinked).not.toHaveBeenCalled();
  });

  it("password success but linkWithCredential rejects -> signOut + error, no onLinked", async () => {
    const user = userEvent.setup();
    signInWithEmailAndPasswordMock.mockResolvedValue({
      user: { uid: "u1", email: EMAIL } as User,
    });
    linkWithCredentialMock.mockRejectedValue({
      code: "auth/invalid-credential",
    });
    signOutMock.mockResolvedValue(undefined);
    const { onLinked } = renderPanel();

    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.click(
      screen.getByRole("button", { name: /sign in to link/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/invalid email or password/i),
      ).toBeInTheDocument(),
    );
    expect(signOutMock).toHaveBeenCalled();
    expect(onLinked).not.toHaveBeenCalled();
  });

  it("Google success but linkWithCredential rejects -> signOut + error, no onLinked", async () => {
    const user = userEvent.setup();
    signInWithPopupMock.mockResolvedValue({
      user: { uid: "u1", email: EMAIL } as User,
    });
    linkWithCredentialMock.mockRejectedValue({
      code: "auth/credential-already-in-use",
    });
    signOutMock.mockResolvedValue(undefined);
    const { onLinked } = renderPanel();

    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    expect(onLinked).not.toHaveBeenCalled();
  });

  it("link rejection + signOut rejects -> error still rendered", async () => {
    const user = userEvent.setup();
    signInWithEmailAndPasswordMock.mockResolvedValue({
      user: { uid: "u1", email: EMAIL } as User,
    });
    linkWithCredentialMock.mockRejectedValue({
      code: "auth/invalid-credential",
    });
    signOutMock.mockRejectedValue(new Error("signOut failed"));
    const { onLinked } = renderPanel();

    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.click(
      screen.getByRole("button", { name: /sign in to link/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/invalid email or password/i),
      ).toBeInTheDocument(),
    );
    expect(onLinked).not.toHaveBeenCalled();
  });

  it("Cancel and return -> onCancel fires", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderPanel();

    await user.click(
      screen.getByRole("button", { name: /cancel and return/i }),
    );

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
