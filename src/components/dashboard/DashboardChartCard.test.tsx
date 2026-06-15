// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ProfileLoadState, UserProfile } from "../../types/profile";

const ctx = vi.hoisted(() => ({
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
  updateProfile: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({
    loadState: ctx.loadState,
    updateProfile: ctx.updateProfile,
  }),
}));

// Convenience: set the loaded profile's persisted dashboard picks for a
// single test, then restore the default afterward via the returned reset.
function setProfile(partial: Partial<UserProfile>) {
  const loaded = ctx.loadState as Extract<
    ProfileLoadState,
    { status: "loaded" }
  >;
  const original = loaded.profile;
  loaded.profile = { ...original, ...partial };
  return () => {
    loaded.profile = original;
  };
}

import { DashboardChartCard } from "./DashboardChartCard";

function getSelect(container: HTMLElement): HTMLSelectElement {
  const select = container.querySelector("select");
  if (!select) throw new Error("select not found");
  return select as HTMLSelectElement;
}

function getSvgTitle(container: HTMLElement): string {
  const svg = container.querySelector("svg.chartSvg, svg[class*='chartSvg']");
  if (!svg) throw new Error("chart svg not found");
  const labelledBy = svg.getAttribute("aria-labelledby");
  if (!labelledBy) throw new Error("svg missing aria-labelledby");
  const title = container.querySelector(`#${CSS.escape(labelledBy)}`);
  return title?.textContent ?? "";
}

function getSvgDesc(container: HTMLElement): string {
  const svg = container.querySelector("svg.chartSvg, svg[class*='chartSvg']");
  if (!svg) throw new Error("chart svg not found");
  const describedBy = svg.getAttribute("aria-describedby");
  if (!describedBy) throw new Error("svg missing aria-describedby");
  const desc = container.querySelector(`#${CSS.escape(describedBy)}`);
  return desc?.textContent ?? "";
}

describe("DashboardChartCard", () => {
  it("seeds the dropdown to the first tracked metric and reflects its name in the chart <title>", () => {
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration", "sleepTime"]}
        healthEntries={[]}
      />,
    );
    expect(getSelect(container).value).toBe("hydration");
    expect(getSvgTitle(container)).toBe("Hydration");
    // Range picker label includes the metric name (per the
    // DashboardChartCard wiring `${metric.name} time range`).
    expect(
      container.querySelector('[role="group"][aria-label="Hydration time range"]'),
    ).toBeTruthy();
  });

  it("changing the dropdown updates both the SVG <title> and the picker label", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration", "sleepTime"]}
        healthEntries={[]}
      />,
    );
    await user.selectOptions(getSelect(container), "sleepTime");
    expect(getSelect(container).value).toBe("sleepTime");
    expect(getSvgTitle(container)).toBe("Total Sleep Time");
    expect(
      container.querySelector(
        '[role="group"][aria-label="Total Sleep Time time range"]',
      ),
    ).toBeTruthy();
  });

  it("un-tracking the currently-selected metric snaps the dropdown to a valid value (no stale name desync)", async () => {
    // This is the regression that the QA finding's HIGH item called out:
    // before the fix, the SVG <title> / dropdown could continue to show
    // a metric that was no longer in the tracked list.
    const user = userEvent.setup();
    const { container, rerender } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration", "sleepTime"]}
        healthEntries={[]}
      />,
    );

    // Pick the second metric explicitly so the un-tracking step has a
    // stale selectedMetricId to fall back from.
    await user.selectOptions(getSelect(container), "sleepTime");
    expect(getSelect(container).value).toBe("sleepTime");
    expect(getSvgTitle(container)).toBe("Total Sleep Time");

    // Un-track sleepTime upstream (parent removes it from the tracked
    // list).
    rerender(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration"]}
        healthEntries={[]}
      />,
    );

    // Dropdown options should no longer include sleepTime. SelectField
    // always renders a disabled placeholder <option value="">, so filter
    // it out before asserting on the real choices.
    const select = getSelect(container);
    const optionValues = Array.from(select.options)
      .map((o) => o.value)
      .filter((v) => v !== "");
    expect(optionValues).toEqual(["hydration"]);
    // The selected value falls back to the first remaining tracked metric.
    expect(select.value).toBe("hydration");
    // Chart <title> tracks the new metric (the seam exposed to SR users).
    expect(getSvgTitle(container)).toBe("Hydration");
    // <desc> SR phrasing is also keyed on the new metric name, not the
    // stale "Total Sleep Time".
    expect(getSvgDesc(container)).toContain("Hydration");
    expect(getSvgDesc(container)).not.toContain("Total Sleep Time");
  });

  it("renders the loading skeleton variant when loading=true (does not flash zero-axes)", () => {
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration"]}
        healthEntries={[]}
        loading
      />,
    );
    // Per spec the loading text replaces the placeholder copy.
    const text = container.querySelector("svg text");
    expect(text?.textContent).toBe("Loading chart data...");
    // SR description switches to the loading sentence.
    expect(getSvgDesc(container)).toBe("Hydration chart is loading.");
  });

  it("works with competition metric definitions and renders an empty state when nothing is tracked", () => {
    const { container, rerender } = render(
      <DashboardChartCard
        type="competition"
        trackedMetricIds={["goals"]}
        competitionEntries={[]}
      />,
    );
    const initialName = getSvgTitle(container);
    expect(initialName.length).toBeGreaterThan(0);
    // Un-track everything: chart and picker disappear, replaced by a
    // human-readable empty-state message. Previously the chart fell
    // back to allMetrics[0], producing a chart for an untracked metric
    // while the picker sat empty — exactly the inconsistency we want
    // to avoid.
    rerender(
      <DashboardChartCard
        type="competition"
        trackedMetricIds={[]}
        competitionEntries={[]}
      />,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("select")).toBeNull();
    expect(container.textContent).toContain("No tracked competition metrics");
  });

  it("dropdown lists exactly the tracked metrics by name (catches label/value mismatches)", () => {
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration", "protein"]}
        healthEntries={[]}
      />,
    );
    const select = getSelect(container);
    // SelectField always renders a disabled placeholder option as the
    // first <option value="">; filter it out so the assertion is on the
    // real choices.
    const realOptions = Array.from(select.options).filter(
      (o) => o.value !== "",
    );
    const labels = realOptions.map((o) => o.textContent);
    // Order matches the canonical HEALTH_METRICS order, not the
    // input array order (filter-by-includes preserves the metric
    // catalog's order). Both names should be present.
    expect(labels).toContain("Hydration");
    expect(labels).toContain("Protein Intake");
    expect(labels.length).toBe(2);
    // And the visible <label> for the field is the health variant
    // (not the competition one), confirming the type prop is wired
    // through to the SelectField label.
    const label = within(container as HTMLElement).getByText(
      "Health metric",
    );
    expect(label).toBeTruthy();
  });
});

// DGT-64: the dashboard should remember which graph (metric) and time
// range the user picked per section, restoring them on reload and
// persisting changes to the profile doc.
describe("DashboardChartCard - persisted graph picks (DGT-64)", () => {
  let resetProfile: (() => void) | null = null;

  beforeEach(() => {
    ctx.updateProfile.mockClear();
  });
  afterEach(() => {
    resetProfile?.();
    resetProfile = null;
  });

  function getActiveRange(container: HTMLElement): string {
    const pressed = container.querySelector(
      '[role="group"] button[aria-pressed="true"]',
    );
    // textContent is e.g. "30d (Last 30 days)"; the leading token is the key.
    return pressed?.textContent?.trim().split(" ")[0] ?? "";
  }

  it("restores the persisted metric instead of defaulting to the first tracked", () => {
    resetProfile = setProfile({
      dashboardCharts: { health: { metric: "sleepTime" } },
    });
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration", "sleepTime"]}
        healthEntries={[]}
      />,
    );
    // Without persistence this would seed to "hydration" (first tracked).
    expect(getSelect(container).value).toBe("sleepTime");
    expect(getSvgTitle(container)).toBe("Total Sleep Time");
  });

  it("restores the persisted time range instead of defaulting to 7d", () => {
    resetProfile = setProfile({
      dashboardCharts: { health: { range: "30d" } },
    });
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration"]}
        healthEntries={[]}
      />,
    );
    expect(getActiveRange(container)).toBe("30d");
  });

  it("falls back to the first tracked metric when the persisted metric is no longer tracked", () => {
    resetProfile = setProfile({
      dashboardCharts: { health: { metric: "sleepTime" } },
    });
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration"]}
        healthEntries={[]}
      />,
    );
    expect(getSelect(container).value).toBe("hydration");
    expect(getSvgTitle(container)).toBe("Hydration");
  });

  it("ignores an unknown persisted range and falls back to 7d", () => {
    resetProfile = setProfile({
      dashboardCharts: { health: { range: "bogus" } },
    });
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration"]}
        healthEntries={[]}
      />,
    );
    expect(getActiveRange(container)).toBe("7d");
  });

  it("rejects an Object.prototype key as a persisted range (own-property guard)", () => {
    // "toString" is inherited on every object, so an `in` check would
    // wrongly accept it; TIME_RANGE_DAYS["toString"] is a function, not
    // a day count. Must fall back to 7d.
    resetProfile = setProfile({
      dashboardCharts: { health: { range: "toString" } },
    });
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration"]}
        healthEntries={[]}
      />,
    );
    expect(getActiveRange(container)).toBe("7d");
  });

  it("persists the metric pick to the profile when the dropdown changes", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration", "sleepTime"]}
        healthEntries={[]}
      />,
    );
    await user.selectOptions(getSelect(container), "sleepTime");
    expect(ctx.updateProfile).toHaveBeenCalledWith({
      dashboardCharts: { health: { metric: "sleepTime" } },
    });
  });

  it("persists the time-range pick to the profile when a range button is clicked", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration"]}
        healthEntries={[]}
      />,
    );
    const btn = within(container)
      .getAllByRole("button")
      .find((b) => b.textContent?.startsWith("30d"));
    if (!btn) throw new Error("30d range button not found");
    await user.click(btn);
    expect(ctx.updateProfile).toHaveBeenCalledWith({
      dashboardCharts: { health: { range: "30d" } },
    });
  });

  it("preserves the section's other pick when persisting a change", async () => {
    // A pre-existing persisted range must survive a metric change (and
    // vice versa) - the write merges into the section's existing pick.
    resetProfile = setProfile({
      dashboardCharts: { health: { range: "30d" } },
    });
    const user = userEvent.setup();
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration", "sleepTime"]}
        healthEntries={[]}
      />,
    );
    await user.selectOptions(getSelect(container), "sleepTime");
    expect(ctx.updateProfile).toHaveBeenCalledWith({
      dashboardCharts: { health: { range: "30d", metric: "sleepTime" } },
    });
  });

  it("merges the pick alongside other sections' persisted picks", async () => {
    // A change to the health card must not clobber a persisted
    // performance/competition pick living on the same doc field.
    resetProfile = setProfile({
      dashboardCharts: { competition: { metric: "goals" } },
    });
    const user = userEvent.setup();
    const { container } = render(
      <DashboardChartCard
        type="health"
        trackedMetricIds={["hydration", "sleepTime"]}
        healthEntries={[]}
      />,
    );
    await user.selectOptions(getSelect(container), "sleepTime");
    expect(ctx.updateProfile).toHaveBeenCalledWith({
      dashboardCharts: {
        competition: { metric: "goals" },
        health: { metric: "sleepTime" },
      },
    });
  });
});
