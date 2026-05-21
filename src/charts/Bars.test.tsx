// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Bars } from "./Bars";
import { getMetricChartConfig } from "./metricChartConfig";
import { linearScale } from "./linearScale";
import type { ChartGeom } from "./chartGeom";

const geom: ChartGeom = {
  plotLeft: 36,
  plotTop: 16,
  plotRight: 308,
  plotBottom: 152,
  plotWidth: 272,
  plotHeight: 136,
};
const yScalePct = linearScale([0, 100], [geom.plotBottom, geom.plotTop]);
// Hydration's inverted scale: 1 at top (small y), 8 at bottom (large y)
const yScaleHydration = linearScale([1, 8], [geom.plotTop, geom.plotBottom]);

function renderInSvg(ui: React.ReactElement) {
  return render(<svg viewBox="0 0 320 180">{ui}</svg>);
}

describe("Bars", () => {
  const data7 = [
    { date: "2026-04-30", value: 80 },
    { date: "2026-05-01", value: null },
    { date: "2026-05-02", value: 70 },
    { date: "2026-05-03", value: 90 },
    { date: "2026-05-04", value: 60 },
    { date: "2026-05-05", value: 88 },
    { date: "2026-05-06", value: 92 },
  ];

  it("renders one bar per non-null day (skips null slots)", () => {
    const { container } = renderInSvg(
      <Bars
        data={data7}
        goalRaw={75}
        config={getMetricChartConfig("sleepEfficiency")}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    const bars = container.querySelectorAll(
      'rect[class*="barAtOrAboveGoal"], rect[class*="barBelowGoal"]',
    );
    expect(bars.length).toBe(6); // 7 days, 1 null
  });

  it("uses bright-green class for values at-or-above goal and muted for below", () => {
    const { container } = renderInSvg(
      <Bars
        data={data7}
        goalRaw={75}
        config={getMetricChartConfig("sleepEfficiency")}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    expect(
      container.querySelectorAll('rect[class*="barAtOrAboveGoal"]').length,
    ).toBe(4); // 80, 90, 88, 92
    expect(
      container.querySelectorAll('rect[class*="barBelowGoal"]').length,
    ).toBe(2); // 70, 60
  });

  it("inverts the comparison for lowerIsBetter metrics like hydration (lower raw = at/above)", () => {
    const data = [
      { date: "2026-05-01", value: 2 }, // <= goal 3 → at/above
      { date: "2026-05-02", value: 5 }, // > goal 3 → below
    ];
    const { container } = renderInSvg(
      <Bars
        data={data}
        goalRaw={3}
        config={getMetricChartConfig("hydration")}
        yScale={yScaleHydration}
        geom={geom}
      />,
    );
    expect(
      container.querySelectorAll('rect[class*="barAtOrAboveGoal"]').length,
    ).toBe(1);
    expect(
      container.querySelectorAll('rect[class*="barBelowGoal"]').length,
    ).toBe(1);
  });

  it("treats a faster time as at/above goal for a lowerIsBetter perf metric (ascending axis)", () => {
    // fortyYardDash: lowerIsBetter, ascending axis (yBottom 4.2 < yTop 10).
    // A 5s run beats a 6s goal; an 8s run misses it.
    const data = [
      { date: "2026-05-01", value: 5 }, // <= goal 6 → at/above
      { date: "2026-05-02", value: 8 }, // > goal 6 → below
    ];
    const { container } = renderInSvg(
      <Bars
        data={data}
        goalRaw={6}
        config={getMetricChartConfig("fortyYardDash")}
        yScale={linearScale([4.2, 10], [geom.plotBottom, geom.plotTop])}
        geom={geom}
      />,
    );
    expect(
      container.querySelectorAll('rect[class*="barAtOrAboveGoal"]').length,
    ).toBe(1);
    expect(
      container.querySelectorAll('rect[class*="barBelowGoal"]').length,
    ).toBe(1);
  });

  it("clamps zero to a 2px sliver (perf metric where 0 is a valid score)", () => {
    const { container } = renderInSvg(
      <Bars
        data={[{ date: "2026-05-06", value: 0 }]}
        config={getMetricChartConfig("goals")}
        yScale={linearScale([0, 10], [geom.plotBottom, geom.plotTop])}
        geom={geom}
      />,
    );
    const bar = container.querySelector(
      'rect[class*="barAtOrAboveGoal"], rect[class*="barBelowGoal"]',
    )!;
    expect(Number(bar.getAttribute("height"))).toBeGreaterThanOrEqual(2);
  });

  it("treats all bars as at/above when no goal is supplied", () => {
    const { container } = renderInSvg(
      <Bars
        data={[
          { date: "2026-05-05", value: 1 },
          { date: "2026-05-06", value: 9 },
        ]}
        config={getMetricChartConfig("goals")}
        yScale={linearScale([0, 10], [geom.plotBottom, geom.plotTop])}
        geom={geom}
      />,
    );
    expect(
      container.querySelectorAll('rect[class*="barAtOrAboveGoal"]').length,
    ).toBe(2);
    expect(
      container.querySelectorAll('rect[class*="barBelowGoal"]').length,
    ).toBe(0);
  });
});
