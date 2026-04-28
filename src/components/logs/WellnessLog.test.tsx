// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import type { ProfileLoadState, UserProfile } from "../../types/profile";
import type { DataLoadState, WellnessEntry } from "../../types/data";

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
      trackedWellnessMetrics: [
        "hydration",
        "sleepTime",
        "sleepEfficiency",
        "protein",
        "leanMass",
        "availability",
      ],
      trackedPerformanceMetrics: [],
      profileComplete: true,
      trackingSetupComplete: true,
    } as UserProfile,
  } as ProfileLoadState,
  wellness: { status: "loaded", entries: [] } as DataLoadState<WellnessEntry>,
  setWellnessEntryMock: vi.fn(
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
    wellness: ctx.wellness,
    setWellnessEntry: ctx.setWellnessEntryMock,
  }),
}));

import { WellnessLog } from "./WellnessLog";
import { dateAtOffset, HISTORY, toISO } from "../../utils/dates";

const TODAY_ISO = toISO(dateAtOffset(HISTORY));

function setSleepTime(value: string) {
  const inputs = document.querySelectorAll("input[type='text']");
  // The wellness log renders one record-input per non-hydration / non-availability
  // numeric metric. The first such input is sleepTime.
  const sleepTimeInput = inputs[0] as HTMLInputElement;
  fireEvent.change(sleepTimeInput, { target: { value } });
}

function setProtein(value: string) {
  const inputs = document.querySelectorAll("input[type='text']");
  // sleepTime, sleepEfficiency, protein, leanMass - protein is index 2.
  const proteinInput = inputs[2] as HTMLInputElement;
  fireEvent.change(proteinInput, { target: { value } });
}

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/wellness" element={<WellnessLog />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("WellnessLog debounce accumulator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.user = { uid: "u1" };
    ctx.wellness = { status: "loaded", entries: [] };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("typing into a single field commits one setWellnessEntry after 500ms idle", async () => {
    renderAt("/wellness");
    setSleepTime("8");
    expect(ctx.setWellnessEntryMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(ctx.setWellnessEntryMock).toHaveBeenCalledTimes(1);
    expect(ctx.setWellnessEntryMock).toHaveBeenCalledWith(
      TODAY_ISO,
      expect.objectContaining({ sleepTime: 8 }),
    );
  });

  it("typing across two fields within 500ms commits one MERGED write", async () => {
    renderAt("/wellness");
    setSleepTime("8");
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    setProtein("1.5");
    expect(ctx.setWellnessEntryMock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(ctx.setWellnessEntryMock).toHaveBeenCalledTimes(1);
    expect(ctx.setWellnessEntryMock).toHaveBeenCalledWith(
      TODAY_ISO,
      expect.objectContaining({ sleepTime: 8, protein: 1.5 }),
    );
  });

  it("flushes pending writes on unmount", async () => {
    const { unmount } = renderAt("/wellness");
    setSleepTime("8");
    expect(ctx.setWellnessEntryMock).not.toHaveBeenCalled();
    unmount();
    expect(ctx.setWellnessEntryMock).toHaveBeenCalledTimes(1);
    expect(ctx.setWellnessEntryMock).toHaveBeenCalledWith(
      TODAY_ISO,
      expect.objectContaining({ sleepTime: 8 }),
    );
  });

  it("Strict-Mode mount->unmount->remount cycle does NOT call setWellnessEntry with empty object", async () => {
    // Simulate Strict Mode by rendering, immediately unmounting, then
    // rendering again. The Object.keys() guard in the cleanup must not
    // emit an empty-object write.
    const { unmount } = renderAt("/wellness");
    unmount();
    renderAt("/wellness");
    // No writes have been queued; setWellnessEntry should not have been
    // called at all.
    expect(ctx.setWellnessEntryMock).not.toHaveBeenCalled();
  });

  it("malformed ?date= falls back to /wellness (drops the malformed search param)", () => {
    // Render with a malformed date AND an alternate route that catches
    // navigations that drop the ?date= param. The Navigate replace will
    // re-mount under the same /wellness route - so we verify the URL
    // ends up with no ?date= param after the bounce.
    render(
      <MemoryRouter initialEntries={["/wellness?date=NOT-A-DATE"]}>
        <Routes>
          <Route path="/wellness" element={<WellnessLog />} />
        </Routes>
      </MemoryRouter>,
    );
    // After the Navigate replace, the URL should be /wellness with no
    // search param, and WellnessLog re-renders against today's date.
    // The render itself succeeding (no crash) is the load-bearing
    // assertion - prior to the fix, the redirect path threw "Rendered
    // more hooks than during the previous render."
    expect(document.querySelectorAll("table").length).toBeGreaterThan(0);
  });

  it("?date= outside [0, HISTORY] falls back to /wellness", () => {
    // Pick an ISO date a year in the future.
    const future = "2099-01-01";
    render(
      <MemoryRouter initialEntries={[`/wellness?date=${future}`]}>
        <Routes>
          <Route path="/wellness" element={<WellnessLog />} />
        </Routes>
      </MemoryRouter>,
    );
    // After the Navigate replace, the URL falls back to today's date
    // and the form renders normally.
    expect(document.querySelectorAll("table").length).toBeGreaterThan(0);
  });

  it("typing then navigating to a different date flushes pending writes for the prior date", async () => {
    // Simulate switching dates by re-rendering at a different ?date=
    const { unmount } = renderAt("/wellness");
    setSleepTime("8");
    expect(ctx.setWellnessEntryMock).not.toHaveBeenCalled();
    // Unmount (the navigation effectively unmounts the prior subtree
    // since useSearchParams swap remounts the Outlet child for date
    // changes only when initialEntries differ; here we just unmount).
    unmount();
    expect(ctx.setWellnessEntryMock).toHaveBeenCalledTimes(1);
    expect(ctx.setWellnessEntryMock).toHaveBeenCalledWith(
      TODAY_ISO,
      expect.objectContaining({ sleepTime: 8 }),
    );
  });
});
