// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import type { ProfileLoadState, UserProfile } from "../../types/profile";
import type { DataLoadState, PerformanceEntry } from "../../types/data";

const ctx = vi.hoisted(() => ({
  user: { uid: "u1" } as { uid: string } | null,
  loadState: {
    status: "loaded",
    profile: {
      version: 1,
      fullName: "T",
      email: "t@e.com",
      nickname: "",
      age: 18,
      heightFt: 5,
      heightIn: 9,
      weight: 150,
      gender: "male" as const,
      athleteType: "endurance" as const,
      competitionTerm: "game",
      trackedWellnessMetrics: [],
      trackedPerformanceMetrics: [
        "wins",
        "losses",
        "goals",
        "assists",
        "yards",
        "tackles",
      ],
      profileComplete: true,
      trackingSetupComplete: true,
    } as UserProfile,
  } as ProfileLoadState,
  performance: {
    status: "loaded",
    entries: [],
  } as DataLoadState<PerformanceEntry>,
  setPerformanceEntryMock: vi.fn(
    async (..._args: unknown[]) => undefined,
  ) as (...args: unknown[]) => Promise<undefined>,
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: ctx.user }),
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ loadState: ctx.loadState }),
}));

vi.mock("../../contexts/DataContext", () => ({
  useData: () => ({
    performance: ctx.performance,
    setPerformanceEntry: ctx.setPerformanceEntryMock,
  }),
}));

import { PerformanceLog } from "./PerformanceLog";
import { dateAtOffset, HISTORY, toISO } from "../../utils/dates";

const TODAY_ISO = toISO(dateAtOffset(HISTORY));

function inputForMetric(label: string): HTMLInputElement {
  const el = document.querySelector(
    `input[aria-label='${label}']`,
  ) as HTMLInputElement | null;
  if (!el) throw new Error(`Could not find input for ${label}`);
  return el;
}

function setGoals(value: string) {
  fireEvent.change(inputForMetric("Goals"), { target: { value } });
}

function setAssists(value: string) {
  fireEvent.change(inputForMetric("Assists"), { target: { value } });
}

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/performance" element={<PerformanceLog />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PerformanceLog debounce accumulator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.user = { uid: "u1" };
    ctx.performance = { status: "loaded", entries: [] };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("typing into a single field commits one setPerformanceEntry after 500ms idle", async () => {
    renderAt("/performance");
    setGoals("3");
    expect(ctx.setPerformanceEntryMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(ctx.setPerformanceEntryMock).toHaveBeenCalledTimes(1);
    const mock = ctx.setPerformanceEntryMock as unknown as {
      mock: { calls: unknown[][] };
    };
    const [date, partial] = mock.mock.calls[0] as [
      string,
      Partial<PerformanceEntry>,
    ];
    expect(date).toBe(TODAY_ISO);
    expect(partial.metrics).toEqual({ goals: 3 });
  });

  it("typing across two performance metrics within 500ms commits one MERGED write", async () => {
    renderAt("/performance");
    setGoals("3");
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    setAssists("2");
    expect(ctx.setPerformanceEntryMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(ctx.setPerformanceEntryMock).toHaveBeenCalledTimes(1);
    const mock = ctx.setPerformanceEntryMock as unknown as {
      mock: { calls: unknown[][] };
    };
    const [date, partial] = mock.mock.calls[0] as [
      string,
      Partial<PerformanceEntry>,
    ];
    expect(date).toBe(TODAY_ISO);
    // Both fields must reach Firestore in a single deep-merged metrics map.
    expect(partial.metrics).toEqual({ goals: 3, assists: 2 });
  });

  it("flushes pending writes on unmount", async () => {
    const { unmount } = renderAt("/performance");
    setGoals("3");
    expect(ctx.setPerformanceEntryMock).not.toHaveBeenCalled();
    unmount();
    expect(ctx.setPerformanceEntryMock).toHaveBeenCalledTimes(1);
    const mock = ctx.setPerformanceEntryMock as unknown as {
      mock: { calls: unknown[][] };
    };
    const [date, partial] = mock.mock.calls[0] as [
      string,
      Partial<PerformanceEntry>,
    ];
    expect(date).toBe(TODAY_ISO);
    expect(partial.metrics).toEqual({ goals: 3 });
  });

  it("Strict-Mode mount->unmount->remount cycle does NOT call setPerformanceEntry with empty object", () => {
    // No writes queued; the Object.keys() guard in cleanup must not emit.
    const { unmount } = renderAt("/performance");
    unmount();
    renderAt("/performance");
    expect(ctx.setPerformanceEntryMock).not.toHaveBeenCalled();
  });

  it("malformed ?date= falls back to /performance", () => {
    render(
      <MemoryRouter initialEntries={["/performance?date=NOT-A-DATE"]}>
        <Routes>
          <Route path="/performance" element={<PerformanceLog />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(document.querySelectorAll("table").length).toBeGreaterThan(0);
  });

  it("typing then unmounting flushes pending writes for the prior date", () => {
    const { unmount } = renderAt("/performance");
    setGoals("3");
    expect(ctx.setPerformanceEntryMock).not.toHaveBeenCalled();
    unmount();
    expect(ctx.setPerformanceEntryMock).toHaveBeenCalledTimes(1);
  });
});
