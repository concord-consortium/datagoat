// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CodapButton } from "./CodapButton";

// matchMedia mock identical in shape to DashboardHeaderSlide.test.tsx so the
// CodapButton's resize-driven flip can be exercised reactively.
function makeMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: initialMatches,
    media: "(min-width: 640px)",
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

describe("CodapButton", () => {
  let mql: ReturnType<typeof makeMatchMedia>;
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mql = makeMatchMedia(true); // default desktop
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn(() => mql),
    });
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it("on desktop (>= 640px) opens the CODAP-wrapped URL in a new tab via window.open", async () => {
    const user = userEvent.setup();
    render(<CodapButton />);
    const button = screen.getByRole("button", {
      name: /Analyze Your Data in CODAP/,
    });
    await user.click(button);
    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, target, features] = openSpy.mock.calls[0];
    expect(url).toMatch(/^https:\/\/codap3\.concord\.org/);
    expect(url).toContain("?di=");
    expect(target).toBe("_blank");
    expect(features).toBe("noopener,noreferrer");
    // Mobile modal should NOT be in the DOM.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("on mobile (< 640px) opens the MobileCodapModal instead of window.open", async () => {
    mql = makeMatchMedia(false);
    (
      window.matchMedia as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(() => mql);
    const user = userEvent.setup();
    render(<CodapButton />);
    const button = screen.getByRole("button", {
      name: /Analyze Your Data in CODAP/,
    });
    await user.click(button);
    expect(openSpy).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("CODAP doesn");
    expect(dialog.textContent).toContain("desktop");
  });

  it("flips reactively: desktop -> resize narrow -> click opens modal (not window.open)", async () => {
    const user = userEvent.setup();
    render(<CodapButton />);
    // Resize to narrow viewport.
    act(() => {
      mql._setMatches(false);
    });
    await user.click(
      screen.getByRole("button", { name: /Analyze Your Data in CODAP/ }),
    );
    expect(openSpy).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("Got it button on the modal closes it", async () => {
    mql = makeMatchMedia(false);
    (
      window.matchMedia as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(() => mql);
    const user = userEvent.setup();
    render(<CodapButton />);
    await user.click(
      screen.getByRole("button", { name: /Analyze Your Data in CODAP/ }),
    );
    const dialog = await screen.findByRole("dialog");
    const dismiss = screen.getByRole("button", { name: "Got it" });
    await user.click(dismiss);
    expect(dialog.isConnected).toBe(false);
  });

  it("subscribes / unsubscribes to matchMedia 'change'", () => {
    const { unmount } = render(<CodapButton />);
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
