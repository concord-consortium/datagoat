// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Axes } from "./Axes";
import { getMetricChartConfig } from "./metricChartConfig";
import type { ChartGeom } from "./chartGeom";

const geom: ChartGeom = {
  plotLeft: 36,
  plotTop: 16,
  plotRight: 308,
  plotBottom: 152,
  plotWidth: 272,
  plotHeight: 136,
};

function renderInSvg(ui: React.ReactElement) {
  return render(<svg viewBox="0 0 320 180">{ui}</svg>);
}

function texts(container: HTMLElement) {
  return Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
}

describe("Axes — y-axis labels", () => {
  it("renders top and bottom y-axis labels using the metric's formatValue", () => {
    const { container } = renderInSvg(
      <Axes
        config={getMetricChartConfig("sleepEfficiency")}
        geom={geom}
        data={[]}
        rangeKey="7d"
      />,
    );
    expect(texts(container)).toContain("100%");
    expect(texts(container)).toContain("0%");
  });

  it("renders inverted y-axis labels for hydration (1 at top, 8 at bottom)", () => {
    const { container } = renderInSvg(
      <Axes
        config={getMetricChartConfig("hydration")}
        geom={geom}
        data={[]}
        rangeKey="7d"
      />,
    );
    expect(texts(container)).toEqual(expect.arrayContaining(["1", "8"]));
  });
});

describe("Axes — x-axis labels", () => {
  function xLabels(container: HTMLElement) {
    return Array.from(container.querySelectorAll('text[class*="xLabel"]')).map(
      (t) => t.textContent,
    );
  }

  it("labels every day at 7d in M/D format", () => {
    const data = [
      { date: "2026-05-01", value: 80 },
      { date: "2026-05-02", value: 80 },
      { date: "2026-05-03", value: 80 },
      { date: "2026-05-04", value: 80 },
      { date: "2026-05-05", value: 80 },
      { date: "2026-05-06", value: 80 },
      { date: "2026-05-07", value: 80 },
    ];
    const { container } = renderInSvg(
      <Axes
        config={getMetricChartConfig("sleepEfficiency")}
        geom={geom}
        data={data}
        rangeKey="7d"
      />,
    );
    expect(xLabels(container).length).toBe(7);
    expect(xLabels(container)).toContain("5/1");
    expect(xLabels(container)).toContain("5/7");
  });

  it("labels every 7 days at 30d (always first and last)", () => {
    const data = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      value: 80,
    }));
    const { container } = renderInSvg(
      <Axes
        config={getMetricChartConfig("sleepEfficiency")}
        geom={geom}
        data={data}
        rangeKey="30d"
      />,
    );
    const ls = xLabels(container);
    expect(ls.length).toBeLessThan(10);
    expect(ls[0]).toBe("4/1");
    expect(ls[ls.length - 1]).toBe("4/30");
  });
});
