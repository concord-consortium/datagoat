// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AverageBadge } from "./AverageBadge";
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

describe("AverageBadge", () => {
  it("renders a badge with 'Avg: ' + formatted value", () => {
    const { container } = renderInSvg(
      <AverageBadge
        averageRaw={83}
        formatValue={(v) => `${v}%`}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    const txts = Array.from(container.querySelectorAll("text")).map(
      (t) => t.textContent,
    );
    expect(txts.some((t) => t?.includes("Avg") && t?.includes("83%"))).toBe(true);
  });

  it("does not render a horizontal average line (badge only)", () => {
    const { container } = renderInSvg(
      <AverageBadge
        averageRaw={83}
        formatValue={(v) => `${v}%`}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    expect(container.querySelector('line[class*="avgLine"]')).toBeNull();
  });

  it("centers the badge vertically on the avg y", () => {
    const { container } = renderInSvg(
      <AverageBadge
        averageRaw={50}
        formatValue={(v) => `${v}%`}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    const rect = container.querySelector('rect[class*="avgBadgeRect"]')!;
    const y = Number(rect.getAttribute("y"));
    const h = Number(rect.getAttribute("height"));
    // 0..100% maps to plotBottom..plotTop. avg=50 → y at midpoint of plot.
    const midY = (geom.plotTop + geom.plotBottom) / 2;
    expect(y + h / 2).toBeCloseTo(midY, 0);
  });

  it("clamps the badge inside the plot when avg is at the top or bottom", () => {
    const top = renderInSvg(
      <AverageBadge
        averageRaw={100}
        formatValue={(v) => `${v}%`}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    const topRect = top.container.querySelector('rect[class*="avgBadgeRect"]')!;
    expect(Number(topRect.getAttribute("y"))).toBeGreaterThanOrEqual(geom.plotTop);

    const bottom = renderInSvg(
      <AverageBadge
        averageRaw={0}
        formatValue={(v) => `${v}%`}
        yScale={yScalePct}
        geom={geom}
      />,
    );
    const botRect = bottom.container.querySelector('rect[class*="avgBadgeRect"]')!;
    const y = Number(botRect.getAttribute("y"));
    const h = Number(botRect.getAttribute("height"));
    expect(y + h).toBeLessThanOrEqual(geom.plotBottom);
  });
});
