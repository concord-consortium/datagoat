// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TodayGhost } from "./TodayGhost";
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

describe("TodayGhost", () => {
  it("renders when today's value is null", () => {
    const data = [
      { date: "2026-05-05", value: 80 },
      { date: "2026-05-06", value: null }, // today
    ];
    const { container } = renderInSvg(
      <TodayGhost data={data} goalRaw={75} yScale={yScalePct} geom={geom} />,
    );
    expect(container.querySelector('rect[class*="todayGhost"]')).toBeTruthy();
  });

  it("does not render when today has a value", () => {
    const data = [
      { date: "2026-05-05", value: 80 },
      { date: "2026-05-06", value: 90 },
    ];
    const { container } = renderInSvg(
      <TodayGhost data={data} goalRaw={75} yScale={yScalePct} geom={geom} />,
    );
    expect(container.querySelector('rect[class*="todayGhost"]')).toBeNull();
  });

  it("does not render when a missing-data day is in the past (not last)", () => {
    const data = [
      { date: "2026-05-05", value: null },
      { date: "2026-05-06", value: 80 },
    ];
    const { container } = renderInSvg(
      <TodayGhost data={data} goalRaw={75} yScale={yScalePct} geom={geom} />,
    );
    expect(container.querySelector('rect[class*="todayGhost"]')).toBeNull();
  });

  it("renders nothing when data is empty", () => {
    const { container } = renderInSvg(
      <TodayGhost data={[]} goalRaw={75} yScale={yScalePct} geom={geom} />,
    );
    expect(container.querySelector('rect[class*="todayGhost"]')).toBeNull();
  });

  it("positions the ghost at the today slot's x and the goal y as its top edge", () => {
    const data = [
      { date: "2026-05-05", value: 80 },
      { date: "2026-05-06", value: null },
    ];
    const { container } = renderInSvg(
      <TodayGhost data={data} goalRaw={75} yScale={yScalePct} geom={geom} />,
    );
    const ghost = container.querySelector('rect[class*="todayGhost"]')!;
    expect(Number(ghost.getAttribute("y"))).toBeCloseTo(yScalePct(75), 0);
  });
});
