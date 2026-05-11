// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

import type { ProfileLoadState, UserProfile } from "../../types/profile";

const ctx = vi.hoisted(() => ({
  isAnyOverlayOpen: false as boolean,
  loadState: {
    status: "loaded",
    profile: {
      version: 1,
      fullName: "Test Athlete",
      email: "t@e.com",
      nickname: "",
      age: 18,
      heightFt: 5,
      heightIn: 9,
      weight: 150,
      gender: "male" as const,
      athleteType: "endurance" as const,
      competitionTerm: "game",
      trackedHealthMetrics: [],
      trackedCompetitionMetrics: [],
      profileComplete: true,
      trackingSetupComplete: true,
    } as UserProfile,
  } as ProfileLoadState,
}));

vi.mock("../../contexts/OverlayContext", () => ({
  useIsAnyOverlayOpen: () => ctx.isAnyOverlayOpen,
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ loadState: ctx.loadState }),
}));

import {
  DashboardHeaderSlide,
  WORDMARK_HOLD_MS,
  MOTIVATION_HOLD_MS,
} from "./DashboardHeaderSlide";

// matchMedia mock with an addEventListener / removeEventListener spy so the
// tests can assert subscribe / unsubscribe + drive the change event.
function makeMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: initialMatches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_type: string, cb: EventListener) => {
      listeners.add(cb as (e: MediaQueryListEvent) => void);
    }),
    removeEventListener: vi.fn((_type: string, cb: EventListener) => {
      listeners.delete(cb as (e: MediaQueryListEvent) => void);
    }),
    dispatchEvent: vi.fn(),
    _listeners: listeners,
    _setMatches(m: boolean) {
      mql.matches = m;
      listeners.forEach((cb) =>
        cb({ matches: m } as unknown as MediaQueryListEvent),
      );
    },
  };
  return mql;
}

describe("DashboardHeaderSlide", () => {
  let mql: ReturnType<typeof makeMatchMedia>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx.isAnyOverlayOpen = false;
    mql = makeMatchMedia(false);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn(() => mql),
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses asymmetric hold timings (WORDMARK_HOLD_MS, MOTIVATION_HOLD_MS)", () => {
    expect(WORDMARK_HOLD_MS).toBe(6750);
    expect(MOTIVATION_HOLD_MS).toBe(9000);
    expect(WORDMARK_HOLD_MS).not.toBe(MOTIVATION_HOLD_MS);
  });

  it("advances on the wordmark hold then the motivation hold", async () => {
    const { container } = render(<DashboardHeaderSlide />);
    // Wordmark slide is initially active.
    const slideItems = container.querySelectorAll(`[class*='headerSlideItem']`);
    expect(slideItems.length).toBe(2);
    expect(slideItems[0].className).toMatch(/active/);
    expect(slideItems[1].className).not.toMatch(/active/);

    await act(async () => {
      vi.advanceTimersByTime(WORDMARK_HOLD_MS + 10);
    });
    const after1 = container.querySelectorAll(`[class*='headerSlideItem']`);
    expect(after1[1].className).toMatch(/active/);

    await act(async () => {
      vi.advanceTimersByTime(MOTIVATION_HOLD_MS + 10);
    });
    const after2 = container.querySelectorAll(`[class*='headerSlideItem']`);
    expect(after2[0].className).toMatch(/active/);
  });

  it("does NOT advance when any overlay is open (carousel paused)", async () => {
    ctx.isAnyOverlayOpen = true;
    const { container } = render(<DashboardHeaderSlide />);
    const slideItems = container.querySelectorAll(`[class*='headerSlideItem']`);
    expect(slideItems[0].className).toMatch(/active/);
    await act(async () => {
      vi.advanceTimersByTime(WORDMARK_HOLD_MS + MOTIVATION_HOLD_MS + 1000);
    });
    const after = container.querySelectorAll(`[class*='headerSlideItem']`);
    // Still on slide 0.
    expect(after[0].className).toMatch(/active/);
  });

  it("does NOT advance when prefers-reduced-motion: reduce", async () => {
    mql._setMatches(true);
    const { container } = render(<DashboardHeaderSlide />);
    await act(async () => {
      vi.advanceTimersByTime(WORDMARK_HOLD_MS + 1000);
    });
    const after = container.querySelectorAll(`[class*='headerSlideItem']`);
    expect(after[0].className).toMatch(/active/);
  });

  it("inactive-slide wordmark has tabIndex=-1 to avoid focusable inside aria-hidden", async () => {
    const { container } = render(<DashboardHeaderSlide />);
    const wordmark = container.querySelector("button[class*='wordmark']");
    expect(wordmark).not.toBeNull();
    // Initially active (slide 0): tabIndex 0.
    expect((wordmark as HTMLElement).tabIndex).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(WORDMARK_HOLD_MS + 10);
    });
    // Now inactive (slide 1 active): tabIndex -1.
    expect((wordmark as HTMLElement).tabIndex).toBe(-1);
  });

  it("subscribes to matchMedia 'change' and unsubscribes on unmount", () => {
    const { unmount } = render(<DashboardHeaderSlide />);
    expect(mql.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    expect(mql._listeners.size).toBeGreaterThan(0);
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    expect(mql._listeners.size).toBe(0);
  });
});
