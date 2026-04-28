// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthCredential } from "firebase/auth";
import { renderWithRouter } from "../../test/router";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const { signInWithProviderMock } = vi.hoisted(() => ({
  signInWithProviderMock: vi.fn(),
}));

vi.mock("./authProviders", () => ({
  googleProvider: { id: "google" } as object,
  facebookProvider: { id: "facebook" } as object,
  signInWithProvider: (...args: unknown[]) => signInWithProviderMock(...args),
}));

const { signInWithEmailAndPasswordMock } = vi.hoisted(() => ({
  signInWithEmailAndPasswordMock: vi.fn(),
}));

vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>(
    "firebase/auth",
  );
  return {
    ...actual,
    signInWithEmailAndPassword: (...args: unknown[]) =>
      signInWithEmailAndPasswordMock(...args),
  };
});

vi.mock("../../firebase", () => ({
  auth: {},
  db: {},
  getAnalyticsLazy: vi.fn(() => Promise.resolve(null)),
}));

import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    signInWithProviderMock.mockReset();
    signInWithEmailAndPasswordMock.mockReset();
  });

  it("OAuth success with verified email -> navigates to /dashboard", async () => {
    const user = userEvent.setup();
    signInWithProviderMock.mockResolvedValue({
      ok: true,
      user: { emailVerified: true },
    });
    renderWithRouter(<LoginForm />, { initialEntries: ["/login"] });
    await user.click(screen.getByRole("button", { name: /continue with google/i }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/dashboard"),
    );
  });

  it("OAuth success with unverified email -> navigates to /verify-email", async () => {
    const user = userEvent.setup();
    signInWithProviderMock.mockResolvedValue({
      ok: true,
      user: { emailVerified: false },
    });
    renderWithRouter(<LoginForm />, { initialEntries: ["/login"] });
    await user.click(screen.getByRole("button", { name: /continue with facebook/i }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/verify-email"),
    );
  });

  it("account-collision -> flips to linking mode with LinkAccountPanel", async () => {
    const user = userEvent.setup();
    signInWithProviderMock.mockResolvedValue({
      ok: false,
      kind: "account-collision",
      email: "user@example.com",
      pendingCredential: {} as AuthCredential,
      existingMethods: ["password"],
    });
    renderWithRouter(<LoginForm />, { initialEntries: ["/login"] });
    await user.click(screen.getByRole("button", { name: /continue with facebook/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /this email is already registered/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/user@example\.com/i)).toBeInTheDocument();
  });

  it("blocked-no-email -> renders the Cloud Function message inline", async () => {
    const user = userEvent.setup();
    signInWithProviderMock.mockResolvedValue({
      ok: false,
      kind: "blocked-no-email",
      message:
        "Your Facebook account does not share an email address with us. Either share your email with Facebook, or sign up with a different method.",
    });
    renderWithRouter(<LoginForm />, { initialEntries: ["/login"] });
    await user.click(screen.getByRole("button", { name: /continue with facebook/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/your facebook account does not share an email/i),
      ).toBeInTheDocument(),
    );
    // Confirm the message text is rendered directly (no lookup), and not
    // the generic 'Something went wrong' fallback.
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("popup-blocked -> renders the pinned authErrorMessages copy", async () => {
    const user = userEvent.setup();
    signInWithProviderMock.mockResolvedValue({
      ok: false,
      kind: "other",
      code: "auth/popup-blocked",
    });
    renderWithRouter(<LoginForm />, { initialEntries: ["/login"] });
    await user.click(screen.getByRole("button", { name: /continue with google/i }));
    await waitFor(() =>
      expect(screen.getByText(/sign-in popup was blocked/i)).toBeInTheDocument(),
    );
  });

  it("email/password sign-in success -> navigates to /dashboard", async () => {
    const user = userEvent.setup();
    signInWithEmailAndPasswordMock.mockResolvedValue({ user: { uid: "u1" } });
    renderWithRouter(<LoginForm />, { initialEntries: ["/login"] });
    await user.type(screen.getByLabelText(/^email/i), "u@example.com");
    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /^log in$/i }));
    await waitFor(() => {
      expect(signInWithEmailAndPasswordMock).toHaveBeenCalledWith(
        {},
        "u@example.com",
        "secret123",
      );
      expect(navigateMock).toHaveBeenCalledWith("/dashboard");
    });
  });
});
