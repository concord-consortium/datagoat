// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

interface MockAuthState {
  user: { emailVerified: boolean; email: string | null } | null;
  loading: boolean;
}

const ctx: { authState: MockAuthState } = {
  authState: { user: null, loading: false },
};

const signOutMock = vi.fn(() => Promise.resolve());

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: ctx.authState.user,
    loading: ctx.authState.loading,
    signOut: signOutMock,
  }),
}));

// CodapPluginSignIn pulls in firebase/auth + authProviders via its imports;
// stub those at the boundary so the unauthed branch renders without
// touching real Firebase.
vi.mock("../components/auth/authProviders", () => ({
  googleProvider: { id: "google" } as object,
  facebookProvider: { id: "facebook" } as object,
  signInWithProvider: vi.fn(),
}));

vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>(
    "firebase/auth",
  );
  return {
    ...actual,
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("../firebase", () => ({
  auth: {},
  db: {},
  getAnalyticsLazy: vi.fn(() => Promise.resolve(null)),
}));

import CodapPlugin from "./CodapPlugin";

describe("CodapPlugin", () => {
  beforeEach(() => {
    signOutMock.mockClear();
  });

  it("loading state renders the loading text", () => {
    ctx.authState = { user: null, loading: true };
    render(<CodapPlugin />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("unauthenticated state renders the in-plugin sign-in panel", () => {
    ctx.authState = { user: null, loading: false };
    render(<CodapPlugin />);
    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
  });

  it("authenticated-but-unverified state shows the verify-email notice + sign-out + signed-in-as email", async () => {
    ctx.authState = {
      user: { emailVerified: false, email: "athlete@school.edu" },
      loading: false,
    };
    const user = userEvent.setup();
    render(<CodapPlugin />);
    expect(screen.getByText(/please verify your email/i)).toBeInTheDocument();
    expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
    expect(screen.getByText("athlete@school.edu")).toBeInTheDocument();
    const signOutBtn = screen.getByRole("button", { name: /sign out/i });
    await user.click(signOutBtn);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});
