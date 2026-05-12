// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
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
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ loadState: ctx.loadState }),
}));

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
