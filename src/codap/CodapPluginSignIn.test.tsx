// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthCredential } from "firebase/auth";

const { signInWithProviderMock } = vi.hoisted(() => ({
  signInWithProviderMock: vi.fn(),
}));

vi.mock("../components/auth/authProviders", () => ({
  googleProvider: { id: "google" } as object,
  facebookProvider: { id: "facebook" } as object,
  signInWithProvider: (...args: unknown[]) => signInWithProviderMock(...args),
}));

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
  });

  it("OAuth success with unverified email signs back out and shows the verify notice", async () => {
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

  it("account-collision flips to the LinkAccountPanel", async () => {
    const user = userEvent.setup();
    signInWithProviderMock.mockResolvedValue({
      ok: false,
      kind: "account-collision",
      email: "user@example.com",
      pendingCredential: {} as AuthCredential,
      existingMethods: ["password"],
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
    await user.click(screen.getByRole("button", { name: /^log in$/i }));
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
    await user.click(screen.getByRole("button", { name: /^log in$/i }));
    await waitFor(() =>
      expect(signInWithEmailAndPasswordMock).toHaveBeenCalledTimes(1),
    );
    expect(signOutMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/please verify your email/i)).not.toBeInTheDocument();
  });
});
