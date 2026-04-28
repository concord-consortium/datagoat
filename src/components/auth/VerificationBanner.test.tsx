// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "../../test/router";

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("../../firebase", () => ({
  auth: {},
  db: {},
  getAnalyticsLazy: vi.fn(() => Promise.resolve(null)),
}));

import { VerificationBanner } from "./VerificationBanner";

interface MockAuthShape {
  user: { uid: string } | null;
  isEmailVerified: boolean;
  daysUnverified: number;
}

function setAuth(value: MockAuthShape) {
  useAuthMock.mockReturnValue({
    ...value,
    loading: false,
    signOut: vi.fn(),
  });
}

describe("VerificationBanner", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    localStorage.clear();
  });

  it("renders when !isEmailVerified && daysUnverified >= 7", () => {
    setAuth({
      user: { uid: "u1" },
      isEmailVerified: false,
      daysUnverified: 7,
    });
    renderWithRouter(<VerificationBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
  });

  it("does not render when daysUnverified < 7", () => {
    setAuth({
      user: { uid: "u1" },
      isEmailVerified: false,
      daysUnverified: 6,
    });
    renderWithRouter(<VerificationBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not render when isEmailVerified is true (regardless of daysUnverified)", () => {
    setAuth({
      user: { uid: "u1" },
      isEmailVerified: true,
      daysUnverified: 365,
    });
    renderWithRouter(<VerificationBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clicking dismiss persists 'verifyBannerDismissed:<uid>' and unmounts the banner", async () => {
    const user = userEvent.setup();
    setAuth({
      user: { uid: "u1" },
      isEmailVerified: false,
      daysUnverified: 8,
    });
    renderWithRouter(<VerificationBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /dismiss verification reminder/i }),
    );
    expect(localStorage.getItem("verifyBannerDismissed:u1")).toBe("1");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("dismissal is keyed per uid - a different uid still sees the banner", () => {
    localStorage.setItem("verifyBannerDismissed:u1", "1");

    setAuth({
      user: { uid: "u2" },
      isEmailVerified: false,
      daysUnverified: 8,
    });
    renderWithRouter(<VerificationBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("container has role='status'; dismiss button has aria-label='Dismiss verification reminder'", () => {
    setAuth({
      user: { uid: "u1" },
      isEmailVerified: false,
      daysUnverified: 8,
    });
    renderWithRouter(<VerificationBanner />);
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dismiss verification reminder" }),
    ).toBeInTheDocument();
  });
});
