// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GoalLineAndBadge } from "./GoalLineAndBadge";
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

function renderInSvg(ui: React.ReactElement) {
  return render(<svg viewBox="0 0 320 180">{ui}</svg>);
}

describe("GoalLineAndBadge", () => {
  it("renders a horizontal goal line spanning the plot at the goal y", () => {
    const { container } = renderInSvg(
      <GoalLineAndBadge
        goalRaw={75}
        formatValue={(v) => `${v}%`}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    const line = container.querySelector('line[class*="goalLine"]')!;
    expect(line).toBeTruthy();
    expect(line.getAttribute("y1")).toBe(line.getAttribute("y2"));
    expect(Number(line.getAttribute("x1"))).toBe(geom.plotLeft);
    expect(Number(line.getAttribute("x2"))).toBe(geom.plotRight);
  });

  it("renders the badge text 'Goal' stacked over the formatted value", () => {
    const { container } = renderInSvg(
      <GoalLineAndBadge
        goalRaw={75}
        formatValue={(v) => `${v}%`}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    const txts = Array.from(container.querySelectorAll("text")).map(
      (t) => t.textContent,
    );
    expect(txts).toContain("Goal");
    expect(txts).toContain("75%");
  });

  it("formats the goal value using the supplied formatter (raw, no suffix)", () => {
    const { container } = renderInSvg(
      <GoalLineAndBadge
        goalRaw={3}
        formatValue={(v) => `${v}`}
        yScale={linearScale([1, 8], [geom.plotTop, geom.plotBottom])}
        geom={geom}
      />,
    );
    const txts = Array.from(container.querySelectorAll("text")).map(
      (t) => t.textContent,
    );
    expect(txts).toContain("3");
  });
});
