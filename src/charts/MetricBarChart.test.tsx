// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MetricBarChart } from "./MetricBarChart";

function renderInSvg(ui: React.ReactElement) {
  return render(<svg viewBox="0 0 320 180">{ui}</svg>);
}

const sampleData = [
  { date: "2026-04-30", value: 80 },
  { date: "2026-05-01", value: 70 },
  { date: "2026-05-02", value: 88 },
  { date: "2026-05-03", value: 92 },
  { date: "2026-05-04", value: 60 },
  { date: "2026-05-05", value: 78 },
  { date: "2026-05-06", value: null }, // today missing
];

describe("MetricBarChart — integration", () => {
  it("composes axes, bars, today-ghost, goal line+badge, and avg badge", () => {
    const { container } = renderInSvg(
      <MetricBarChart
        metricId="sleepEfficiency"
        data={sampleData}
        goalRaw={75}
        averageRaw={78}
        rangeKey="7d"
        width={320}
        height={180}
      />,
    );
    // Y-axis labels (Axes)
    const txts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(txts).toContain("100%");
    expect(txts).toContain("0%");
    // Bars (6 non-null days)
    expect(
      container.querySelectorAll(
        'rect[class*="barAtOrAboveGoal"], rect[class*="barBelowGoal"]',
      ).length,
    ).toBe(6);
    // Today ghost (today is null)
    expect(container.querySelector('rect[class*="todayGhost"]')).toBeTruthy();
    // Goal line + badge
    expect(container.querySelector('line[class*="goalLine"]')).toBeTruthy();
    expect(txts).toContain("Goal");
    expect(txts).toContain("75%");
    // Avg badge
    expect(container.querySelector('g[class*="avgBadge"]')).toBeTruthy();
    expect(txts.some((t) => t?.includes("Avg") && t?.includes("78%"))).toBe(true);
  });

  it("works without goal or average (just axes + bars)", () => {
    const { container } = renderInSvg(
      <MetricBarChart
        metricId="goals"
        data={[{ date: "2026-05-06", value: 3 }]}
        rangeKey="7d"
        width={320}
        height={180}
      />,
    );
    expect(container.querySelector('line[class*="goalLine"]')).toBeNull();
    expect(container.querySelector('g[class*="avgBadge"]')).toBeNull();
    expect(
      container.querySelectorAll(
        'rect[class*="barAtOrAboveGoal"], rect[class*="barBelowGoal"]',
      ).length,
    ).toBe(1);
  });

  it("uses the inverted y-scale for hydration", () => {
    // Hydration: low raw = "good" displayed at top.
    const { container } = renderInSvg(
      <MetricBarChart
        metricId="hydration"
        data={[
          { date: "2026-05-05", value: 2 }, // good (<=3)
          { date: "2026-05-06", value: 6 }, // bad (>3)
        ]}
        goalRaw={3}
        rangeKey="7d"
        width={320}
        height={180}
      />,
    );
    // 1 at-or-above (the 2), 1 below (the 6)
    expect(
      container.querySelectorAll('rect[class*="barAtOrAboveGoal"]').length,
    ).toBe(1);
    expect(
      container.querySelectorAll('rect[class*="barBelowGoal"]').length,
    ).toBe(1);
    // The "good" bar (value 2) should be taller than the "bad" bar (value 6)
    // because the inverted axis puts 1 at the top (small y) and 8 at the bottom.
    const bars = Array.from(container.querySelectorAll("rect"))
      .filter((r) => r.getAttribute("class")?.includes("barAtOrAboveGoal") ||
                     r.getAttribute("class")?.includes("barBelowGoal"))
      .map((r) => Number(r.getAttribute("height")));
    expect(bars[0]).toBeGreaterThan(bars[1]);
  });
});
