// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MetricChart } from "./MetricChart";

const sampleData = [
  { date: "2026-04-25", value: 4 },
  { date: "2026-04-26", value: 5 },
  { date: "2026-04-27", value: 6 },
];

describe("MetricChart", () => {
  it("wires aria-labelledby/aria-describedby to the SVG <title>/<desc>", () => {
    const { container } = render(
      <MetricChart
        type="line"
        data={sampleData}
        title="Hydration"
        description="Hydration over the last 7 days. Goal: 4 level. Recent average: 5 level."
      />,
    );

    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute("role")).toBe("img");

    const labelledBy = svg!.getAttribute("aria-labelledby")!;
    const describedBy = svg!.getAttribute("aria-describedby")!;
    expect(labelledBy).toBeTruthy();
    expect(describedBy).toBeTruthy();
    expect(labelledBy).not.toBe(describedBy);

    const titleEl = container.querySelector(`#${CSS.escape(labelledBy)}`);
    const descEl = container.querySelector(`#${CSS.escape(describedBy)}`);
    expect(titleEl?.tagName.toLowerCase()).toBe("title");
    expect(descEl?.tagName.toLowerCase()).toBe("desc");
    expect(titleEl?.textContent).toBe("Hydration");
    expect(descEl?.textContent).toContain("Hydration over the last 7 days");
    expect(descEl?.textContent).toContain("Goal: 4 level");
    expect(descEl?.textContent).toContain("Recent average: 5 level");
  });

  it("Show data toggle reveals the data table to sighted users (visuallyHidden flips off)", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MetricChart
        type="line"
        data={sampleData}
        title="Hydration"
        description="desc"
      />,
    );

    const toggle = screen.getByRole("button", { name: "Show data" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const controlsId = toggle.getAttribute("aria-controls")!;
    const dataWrap = container.querySelector(`#${CSS.escape(controlsId)}`)!;
    // visuallyHidden by default - the wrapping div carries the utility class.
    expect(dataWrap.className).toMatch(/visuallyHidden/);

    await user.click(toggle);
    expect(toggle.textContent).toBe("Hide data");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(dataWrap.className).not.toMatch(/visuallyHidden/);

    // The revealed table contains the data rows.
    const table = within(dataWrap as HTMLElement).getByRole("table");
    expect(within(table).getAllByRole("row").length).toBe(sampleData.length + 1); // header + data
    expect(within(table).getByText("2026-04-25")).toBeTruthy();
  });

  it("renders the loading skeleton label when loading=true and an empty data table", () => {
    const { container } = render(
      <MetricChart
        type="line"
        data={[]}
        title="Sleep Time"
        description="Sleep Time chart is loading."
        loading
      />,
    );
    const text = container.querySelector("svg text");
    expect(text?.textContent).toBe("Loading chart data...");
    // Empty-state copy reflects loading rather than "no data yet".
    expect(container.textContent).toContain("Sleep Time data is loading...");
  });

  it("renders the placeholder label when not loading", () => {
    const { container } = render(
      <MetricChart type="line" data={sampleData} title="Hydration" description="d" />,
    );
    const text = container.querySelector("svg text");
    expect(text?.textContent).toBe("Chart placeholder - TBD");
  });
});
