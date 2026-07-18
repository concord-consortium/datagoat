// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LogSection } from "./LogSection";

function renderSection(props: Partial<Parameters<typeof LogSection>[0]> = {}) {
  return render(
    <LogSection section="daily" count={1} {...props}>
      <tr>
        <td>summary</td>
        <td>Hydration</td>
        <td>record</td>
      </tr>
    </LogSection>,
  );
}

describe("LogSection", () => {
  it("renders the label and metric count", () => {
    renderSection({ section: "weekly", count: 3 });
    expect(screen.getByRole("button", { name: /Weekly Metrics/ })).toBeTruthy();
    expect(screen.getByText("(3 metrics)")).toBeTruthy();
  });

  it("singularizes the count", () => {
    renderSection({ section: "quarterly", count: 1 });
    expect(screen.getByText("(1 metric)")).toBeTruthy();
  });

  it("is collapsed by default and unmounts its content", () => {
    renderSection();
    expect(screen.queryByText("Hydration")).toBeNull();
    expect(
      screen.getByRole("button", { name: /Daily Metrics/ }).getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("renders content when defaultOpen is set", () => {
    renderSection({ defaultOpen: true });
    expect(screen.getByText("Hydration")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Daily Metrics/ }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("toggles open and closed on click", () => {
    renderSection();
    const btn = screen.getByRole("button", { name: /Daily Metrics/ });
    fireEvent.click(btn);
    expect(screen.getByText("Hydration")).toBeTruthy();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(btn);
    expect(screen.queryByText("Hydration")).toBeNull();
  });

  it("points aria-controls at the region it toggles", () => {
    renderSection({ defaultOpen: true });
    const btn = screen.getByRole("button", { name: /Daily Metrics/ });
    const id = btn.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)).toBeTruthy();
  });

  it("shows the empty state instead of a table when count is 0", () => {
    render(<LogSection section="weekly" count={0} defaultOpen>{null}</LogSection>);
    expect(screen.getByText("No weekly metrics to track")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders the column headers when it has rows", () => {
    renderSection({ defaultOpen: true });
    expect(screen.getByRole("columnheader", { name: "Summary" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Metric" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Record" })).toBeTruthy();
  });

  it("exposes the toggle inside a level-2 heading for the page outline", () => {
    renderSection({ section: "weekly", count: 3 });
    const heading = screen.getByRole("heading", { level: 2, name: /Weekly Metrics/ });
    // The toggle button lives inside the heading, not beside it.
    expect(heading.querySelector("button")).toBeTruthy();
  });

  it("gives the table an accessible name matching its section", () => {
    renderSection({ section: "weekly", count: 1, defaultOpen: true });
    // Without this the six sibling frequency tables are indistinguishable in
    // an assistive-tech tables list; the name comes from the section label.
    expect(screen.getByRole("table", { name: "Weekly Metrics" })).toBeTruthy();
  });
});
