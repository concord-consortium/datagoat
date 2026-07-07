// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MetricSparkline } from "./MetricSparkline";

function series(values: Array<number | null>) {
  return values.map((value, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    value,
  }));
}

describe("MetricSparkline", () => {
  it("renders one bar per non-null day", () => {
    const { container } = render(
      <MetricSparkline metricId="hydration" data={series([1, null, 3, null, 5, 2, 4])} />,
    );
    // 5 non-null values -> 5 bar rects; null days render nothing.
    expect(container.querySelectorAll("rect")).toHaveLength(5);
  });

  it("renders the two axis lines and no bars for an all-null series", () => {
    const { container } = render(
      <MetricSparkline metricId="hydration" data={series([null, null, null])} />,
    );
    expect(container.querySelectorAll("rect")).toHaveLength(0);
    expect(container.querySelectorAll("line")).toHaveLength(2); // y + x axis
  });

  it("renders an svg for an inverted metric (hydration) without throwing", () => {
    const { container } = render(
      <MetricSparkline metricId="hydration" data={series([1, 2, 3, 4, 5, 6, 7])} />,
    );
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelectorAll("rect")).toHaveLength(7);
  });
});
