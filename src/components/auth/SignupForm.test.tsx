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

const {
  signInWithProviderMock,
  createUserWithEmailAndPasswordMock,
  sendEmailVerificationMock,
} = vi.hoisted(() => ({
  signInWithProviderMock: vi.fn(),
  createUserWithEmailAndPasswordMock: vi.fn(),
  sendEmailVerificationMock: vi.fn(),
}));

vi.mock("./authProviders", () => ({
  googleProvider: { id: "google" } as object,
  facebookProvider: { id: "facebook" } as object,
  signInWithProvider: (...args: unknown[]) => signInWithProviderMock(...args),
}));

vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>(
    "firebase/auth",
  );
  return {
    ...actual,
    createUserWithEmailAndPassword: (...args: unknown[]) =>
      createUserWithEmailAndPasswordMock(...args),
    sendEmailVerification: (...args: unknown[]) =>
      sendEmailVerificationMock(...args),
  };
});

vi.mock("../../firebase", () => ({
  auth: {},
  db: {},
  getAnalyticsLazy: vi.fn(() => Promise.resolve(null)),
}));

import { SignupForm } from "./SignupForm";

describe("SignupForm", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    signInWithProviderMock.mockReset();
    createUserWithEmailAndPasswordMock.mockReset();
    sendEmailVerificationMock.mockReset();
  });

  it("successful create -> sendEmailVerification resolves -> navigates to /verify-email with no failure flag", async () => {
    const user = userEvent.setup();
    createUserWithEmailAndPasswordMock.mockResolvedValue({
      user: { uid: "u1", emailVerified: false },
    });
    sendEmailVerificationMock.mockResolvedValue(undefined);
    renderWithRouter(<SignupForm />, { initialEntries: ["/signup"] });
    await user.type(screen.getByLabelText(/^email/i), "new@example.com");
    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/verify-email", {
        state: { sendFailed: false },
      }),
    );
  });

  it("successful create -> sendEmailVerification rejects -> navigates with sendFailed: true", async () => {
    const user = userEvent.setup();
    createUserWithEmailAndPasswordMock.mockResolvedValue({
      user: { uid: "u1", emailVerified: false },
    });
    sendEmailVerificationMock.mockRejectedValue(new Error("boom"));
    renderWithRouter(<SignupForm />, { initialEntries: ["/signup"] });
    await user.type(screen.getByLabelText(/^email/i), "new@example.com");
    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/verify-email", {
        state: { sendFailed: true },
      }),
    );
  });

  it("OAuth account-collision -> flips to linking mode (shared LinkAccountPanel)", async () => {
    const user = userEvent.setup();
    signInWithProviderMock.mockResolvedValue({
      ok: false,
      kind: "account-collision",
      email: "x@example.com",
      pendingCredential: {} as AuthCredential,
    });
    renderWithRouter(<SignupForm />, { initialEntries: ["/signup"] });
    await user.click(
      screen.getByRole("button", { name: /continue with facebook/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /this email is already registered/i }),
      ).toBeInTheDocument(),
    );
  });

  it("OAuth blocked-no-email path renders the Cloud Function message inline (parity with LoginForm)", async () => {
    const user = userEvent.setup();
    signInWithProviderMock.mockResolvedValueOnce({
      ok: false,
      kind: "blocked-no-email",
      message: "Your Facebook account does not share an email address with us.",
    });
    renderWithRouter(<SignupForm />, { initialEntries: ["/signup"] });
    await user.click(
      screen.getByRole("button", { name: /continue with facebook/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/your facebook account does not share an email/i),
      ).toBeInTheDocument(),
    );
  });

  it("OAuth popup-blocked path renders the pinned authErrorMessages copy (parity with LoginForm)", async () => {
    const user = userEvent.setup();
    signInWithProviderMock.mockResolvedValue({
      ok: false,
      kind: "other",
      code: "auth/popup-blocked",
    });
    renderWithRouter(<SignupForm />, { initialEntries: ["/signup"] });
    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );
    await waitFor(() =>
      expect(screen.getByText(/sign-in popup was blocked/i)).toBeInTheDocument(),
    );
  });
});
