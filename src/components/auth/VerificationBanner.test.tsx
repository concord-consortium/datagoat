// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * MS_PER_DAY).toUTCString();
}

interface MockAuthShape {
  user: { uid: string; metadata?: { creationTime?: string } } | null;
  isEmailVerifiedOrTrusted: boolean;
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

  it("renders when !isEmailVerifiedOrTrusted && daysUnverified >= 7", () => {
    setAuth({
      user: { uid: "u1", metadata: { creationTime: daysAgo(7) } },
      isEmailVerifiedOrTrusted: false,
    });
    renderWithRouter(<VerificationBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
  });

  it("does not render when daysUnverified < 7", () => {
    setAuth({
      user: { uid: "u1", metadata: { creationTime: daysAgo(6) } },
      isEmailVerifiedOrTrusted: false,
    });
    renderWithRouter(<VerificationBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not render when isEmailVerifiedOrTrusted is true (regardless of daysUnverified)", () => {
    setAuth({
      user: { uid: "u1", metadata: { creationTime: daysAgo(365) } },
      isEmailVerifiedOrTrusted: true,
    });
    renderWithRouter(<VerificationBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clicking dismiss persists 'verifyBannerDismissed:<uid>' and unmounts the banner", async () => {
    const user = userEvent.setup();
    setAuth({
      user: { uid: "u1", metadata: { creationTime: daysAgo(8) } },
      isEmailVerifiedOrTrusted: false,
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
      user: { uid: "u2", metadata: { creationTime: daysAgo(8) } },
      isEmailVerifiedOrTrusted: false,
    });
    renderWithRouter(<VerificationBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  // Regression: useState(() => localStorage...) initializer only runs at
  // mount, so without a uid-keyed remount, account switches within the
  // same SPA session inherit the previous uid's dismissal. AppShell
  // passes key={user?.uid} to force-remount; this test asserts that
  // contract by simulating the parent's behavior.
  it("re-keying on uid resets dismissal state across account switches", async () => {
    const user = userEvent.setup();
    const wrap = (uid: string) => (
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="*" element={<VerificationBanner key={uid} />} />
        </Routes>
      </MemoryRouter>
    );

    setAuth({
      user: { uid: "u1", metadata: { creationTime: daysAgo(8) } },
      isEmailVerifiedOrTrusted: false,
    });
    const { rerender } = render(wrap("u1"));
    expect(screen.getByRole("status")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /dismiss verification reminder/i }),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    setAuth({
      user: { uid: "u2", metadata: { creationTime: daysAgo(8) } },
      isEmailVerifiedOrTrusted: false,
    });
    rerender(wrap("u2"));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("container has role='status'; dismiss button has aria-label='Dismiss verification reminder'", () => {
    setAuth({
      user: { uid: "u1", metadata: { creationTime: daysAgo(8) } },
      isEmailVerifiedOrTrusted: false,
    });
    renderWithRouter(<VerificationBanner />);
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dismiss verification reminder" }),
    ).toBeInTheDocument();
  });

  describe("threshold refresh in long-running sessions", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("appears after the hourly tick when the session crosses 7 days", () => {
      // Account created just under 7 days ago - banner should not show yet.
      const creationTime = new Date(
        Date.now() - (7 * MS_PER_DAY - 30 * 60 * 1000),
      ).toUTCString();
      setAuth({
        user: { uid: "u1", metadata: { creationTime } },
        isEmailVerifiedOrTrusted: false,
      });
      renderWithRouter(<VerificationBanner />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      // Advance past the threshold; the hourly interval should fire and re-render.
      act(() => {
        vi.advanceTimersByTime(60 * 60 * 1000);
      });
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("appears on visibilitychange after the threshold is crossed", () => {
      const creationTime = new Date(
        Date.now() - (7 * MS_PER_DAY - 5 * 60 * 1000),
      ).toUTCString();
      setAuth({
        user: { uid: "u1", metadata: { creationTime } },
        isEmailVerifiedOrTrusted: false,
      });
      renderWithRouter(<VerificationBanner />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      // Cross the threshold while the document is hidden, then return to visible.
      act(() => {
        vi.advanceTimersByTime(10 * 60 * 1000);
      });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });
});
