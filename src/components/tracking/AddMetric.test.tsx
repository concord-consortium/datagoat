// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ProfileLoadState, UserProfile } from "../../types/profile";

const PROFILE: UserProfile = {
  version: 1,
  fullName: "T",
  email: "t@e.com",
  nickname: "",
  age: 18,
  heightFt: 5,
  heightIn: 9,
  weight: 150,
  gender: "male",
  athleteType: "endurance",
  competitionTerm: "game",
  trackedWellnessMetrics: ["wellness-custom-1"],
  trackedPerformanceMetrics: [],
  profileComplete: true,
  trackingSetupComplete: true,
};

const ctx = vi.hoisted(() => ({
  loadState: { status: "loaded" } as ProfileLoadState,
  setTrackedMetrics: vi.fn(async () => undefined),
  updateProfile: vi.fn(async () => undefined),
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({
    loadState: ctx.loadState,
    setTrackedMetrics: ctx.setTrackedMetrics,
    updateProfile: ctx.updateProfile,
  }),
}));

import { AddMetric } from "./AddMetric";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/add-metric/:type" element={<AddMetric />} />
        <Route path="/setup/tracking" element={<div>tracking setup</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  ctx.loadState = { status: "loaded", profile: PROFILE };
  ctx.setTrackedMetrics.mockClear();
  ctx.updateProfile.mockClear();
});

describe("AddMetric", () => {
  it("redirects to /setup/tracking when :type is invalid", () => {
    renderAt("/add-metric/bogus");
    expect(screen.getByText("tracking setup")).toBeTruthy();
  });

  it("clicking + calls setTrackedMetrics with id appended", async () => {
    renderAt("/add-metric/wellness");
    const addBtn = screen.getByRole("button", {
      name: "Add Wellness Metric2",
    });
    fireEvent.click(addBtn);
    await Promise.resolve();
    expect(ctx.setTrackedMetrics).toHaveBeenCalledWith("wellness", [
      "wellness-custom-1",
      "wellness-custom-2",
    ]);
  });

  it("clicking + dedupes if id already present", async () => {
    // Force the addable list's first item ('wellness-custom-1') to appear
    // tracked. Clicking + on a tracked row would actually render '-', so
    // verify dedupe via a different code path: load with a profile where
    // trackedWellnessMetrics contains the 2nd item, then clicking + on
    // a 3rd item still dedupes via the filter on next.
    ctx.loadState = {
      status: "loaded",
      profile: {
        ...PROFILE,
        trackedWellnessMetrics: ["wellness-custom-3", "wellness-custom-3"],
      },
    };
    renderAt("/add-metric/wellness");
    const addBtn = screen.getByRole("button", {
      name: "Add Wellness Metric4",
    });
    fireEvent.click(addBtn);
    await Promise.resolve();
    expect(ctx.setTrackedMetrics).toHaveBeenCalledWith("wellness", [
      "wellness-custom-3",
      "wellness-custom-4",
    ]);
  });

  it("clicking - calls setTrackedMetrics with id filtered out", async () => {
    renderAt("/add-metric/wellness");
    const removeBtn = screen.getByRole("button", {
      name: "Remove Wellness Metric1",
    });
    fireEvent.click(removeBtn);
    await Promise.resolve();
    expect(ctx.setTrackedMetrics).toHaveBeenCalledWith("wellness", []);
  });

  it("falls back to updateProfile when no profile is loaded", async () => {
    ctx.loadState = { status: "missing" };
    renderAt("/add-metric/performance");
    // With no profile, trackedIds defaults to PERFORMANCE_METRICS ids.
    // Clicking + on a placeholder appends to that default list.
    const addBtn = screen.getByRole("button", {
      name: "Add Performance Metric1",
    });
    fireEvent.click(addBtn);
    await Promise.resolve();
    expect(ctx.updateProfile).toHaveBeenCalledTimes(1);
    expect(ctx.setTrackedMetrics).not.toHaveBeenCalled();
    const [arg] = ctx.updateProfile.mock.calls[0];
    expect(arg).toHaveProperty("trackedPerformanceMetrics");
    expect(arg.trackedPerformanceMetrics).toContain("performance-custom-1");
  });
});
