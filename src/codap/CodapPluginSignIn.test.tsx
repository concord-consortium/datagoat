// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthCredential } from "firebase/auth";

const { signInWithProviderMock } = vi.hoisted(() => ({
  signInWithProviderMock: vi.fn(),
}));

vi.mock("../components/auth/authProviders", () => {
  const TRUSTED = new Set(["google.com", "facebook.com"]);
  return {
    googleProvider: { id: "google" } as object,
    facebookProvider: { id: "facebook" } as object,
    signInWithProvider: (...args: unknown[]) => signInWithProviderMock(...args),
    isEmailVerifiedOrTrustedProvider: (u: {
      emailVerified?: boolean;
      email?: string | null;
      providerData?: Array<{ providerId: string }>;
    }) => {
      if (u.emailVerified) return true;
      if (!u.email) return false;
      return (u.providerData ?? []).some((p) => TRUSTED.has(p.providerId));
    },
  };
});

const { signInWithEmailAndPasswordMock, signOutMock } = vi.hoisted(() => ({
  signInWithEmailAndPasswordMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>(
    "firebase/auth",
  );
  return {
    ...actual,
    signInWithEmailAndPassword: (...args: unknown[]) =>
      signInWithEmailAndPasswordMock(...args),
    signOut: (...args: unknown[]) => signOutMock(...args),
  };
});

vi.mock("../firebase", () => ({
  auth: {},
  db: {},
  getAnalyticsLazy: vi.fn(() => Promise.resolve(null)),
}));

import { CodapPluginSignIn } from "./CodapPluginSignIn";

describe("CodapPluginSignIn", () => {
  beforeEach(() => {
    signInWithProviderMock.mockReset();
    signInWithEmailAndPasswordMock.mockReset();
    signOutMock.mockReset();
    signOutMock.mockResolvedValue(undefined);
  });

  it("renders the three sign-in methods plus signup/forgot links", () => {
    render(<CodapPluginSignIn />);
    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continue with facebook/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    const signUp = screen.getByRole("link", { name: /sign up/i });
    expect(signUp).toHaveAttribute("target", "_blank");
    expect(signUp.getAttribute("href")).toMatch(/\/signup$/);
  });

  it("OAuth success with verified email leaves the panel quiet (parent re-renders via auth state)", async () => {
    const user = userEvent.setup();
    signInWithProviderMock.mockResolvedValue({
      ok: true,
      user: { emailVerified: true },
    });
    render(<CodapPluginSignIn />);
    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );
    await waitFor(() => expect(signInWithProviderMock).toHaveBeenCalledTimes(1));
    expect(signOutMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/please verify your email/i)).not.toBeInTheDocument();
    const signInBtn = screen.getByRole("button", { name: /^sign in$/i });
    expect(signInBtn).toBeInTheDocument();
    await waitFor(() => expect(signInBtn).not.toBeDisabled());
  });

  it("OAuth success with unverified email (no trusted provider) signs back out and shows the verify notice", async () => {
    const user = userEvent.setup();
    signInWithProviderMock.mockResolvedValue({
      ok: true,
      user: { emailVerified: false },
    });
    render(<CodapPluginSignIn />);
    await user.click(
      screen.getByRole("button", { name: /continue with facebook/i }),
    );
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(/please verify your email/i),
    ).toBeInTheDocument();
  });

  it("OAuth success via Facebook with emailVerified=false but trusted-provider data leaves the panel quiet (bypasses verify gate)", async () => {
    const user = userEvent.setup();
    signInWithProviderMock.mockResolvedValue({
      ok: true,
      user: {
        emailVerified: false,
        email: "fb@example.com",
        providerData: [{ providerId: "facebook.com" }],
      },
    });
    render(<CodapPluginSignIn />);
    await user.click(
      screen.getByRole("button", { name: /continue with facebook/i }),
    );
    await waitFor(() => expect(signInWithProviderMock).toHaveBeenCalledTimes(1));
    expect(signOutMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/please verify your email/i)).not.toBeInTheDocument();
  });

  it("account-collision flips to the LinkAccountPanel", async () => {
    const user = userEvent.setup();
    signInWithProviderMock.mockResolvedValue({
      ok: false,
      kind: "account-collision",
      email: "user@example.com",
      pendingCredential: {} as AuthCredential,
    });
    render(<CodapPluginSignIn />);
    await user.click(
      screen.getByRole("button", { name: /continue with facebook/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: /this email is already registered/i,
        }),
      ).toBeInTheDocument();
    });
  });

  it("popup-blocked surfaces the pinned error copy", async () => {
    const user = userEvent.setup();
    signInWithProviderMock.mockResolvedValue({
      ok: false,
      kind: "other",
      code: "auth/popup-blocked",
    });
    render(<CodapPluginSignIn />);
    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );
    await waitFor(() =>
      expect(screen.getByText(/sign-in popup was blocked/i)).toBeInTheDocument(),
    );
  });

  it("email/password success with unverified email signs back out and shows the verify notice", async () => {
    const user = userEvent.setup();
    signInWithEmailAndPasswordMock.mockResolvedValue({
      user: { emailVerified: false },
    });
    render(<CodapPluginSignIn />);
    await user.type(screen.getByLabelText(/^email/i), "u@example.com");
    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(/please verify your email/i),
    ).toBeInTheDocument();
  });

  it("email/password success with verified email leaves the panel quiet", async () => {
    const user = userEvent.setup();
    signInWithEmailAndPasswordMock.mockResolvedValue({
      user: { emailVerified: true },
    });
    render(<CodapPluginSignIn />);
    await user.type(screen.getByLabelText(/^email/i), "u@example.com");
    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() =>
      expect(signInWithEmailAndPasswordMock).toHaveBeenCalledTimes(1),
    );
    expect(signOutMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/please verify your email/i)).not.toBeInTheDocument();
    const stillThere = screen.getByRole("button", { name: /^sign in$/i });
    expect(stillThere).toBeInTheDocument();
    await waitFor(() => expect(stillThere).not.toBeDisabled());
  });
});
