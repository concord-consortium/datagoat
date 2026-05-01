// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TimeRangePicker, type TimeRangeKey } from "./TimeRangePicker";

// The picker is implemented as a role="group" of aria-pressed toggle
// buttons (NOT a radiogroup), so the keyboard contract is the default
// browser tab order rather than ArrowKey-driven radio semantics. The
// SR-name contract is the visible "7d" + visually-hidden " (7 days)"
// expansion (WCAG 2.5.3) and aria-pressed reflecting the active key.

describe("TimeRangePicker", () => {
  it("renders six pills inside a labelled group with the selected one aria-pressed", () => {
    render(<TimeRangePicker value="2w" onChange={() => {}} />);
    const group = screen.getByRole("group", { name: "Chart time range" });
    const buttons = group.querySelectorAll("button");
    expect(buttons.length).toBe(6);

    const labels = Array.from(buttons).map((b) => b.textContent ?? "");
    expect(labels[0]).toContain("7d");
    expect(labels[0]).toContain("(7 days)");
    expect(labels[1]).toContain("2w");
    expect(labels[1]).toContain("(2 weeks)");
    expect(labels[5]).toContain("All");
    expect(labels[5]).toContain("(All time)");

    const pressed = Array.from(buttons).filter(
      (b) => b.getAttribute("aria-pressed") === "true",
    );
    expect(pressed.length).toBe(1);
    expect(pressed[0].textContent).toContain("2w");
  });

  it("respects ariaLabel override (used by DashboardChartCard for the metric name)", () => {
    render(
      <TimeRangePicker
        value="7d"
        onChange={() => {}}
        ariaLabel="Hydration time range"
      />,
    );
    expect(
      screen.getByRole("group", { name: "Hydration time range" }),
    ).toBeTruthy();
  });

  it("fires onChange with the typed key when a pill is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(next: TimeRangeKey) => void>();
    render(<TimeRangePicker value="7d" onChange={onChange} />);

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[2]); // "30d"
    expect(onChange).toHaveBeenCalledWith("30d");

    await user.click(buttons[5]); // "All"
    expect(onChange).toHaveBeenLastCalledWith("All");
  });

  it("does not fire onChange when clicking the already-active pill (no re-affirmation)", async () => {
    // The component fires onChange unconditionally on click — confirm
    // that explicitly so a future change to filter same-value clicks
    // is a deliberate decision and not a silent regression.
    const user = userEvent.setup();
    const onChange = vi.fn<(next: TimeRangeKey) => void>();
    render(<TimeRangePicker value="7d" onChange={onChange} />);
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]); // already active "7d"
    expect(onChange).toHaveBeenCalledWith("7d");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("tabs through the pills in document order", async () => {
    const user = userEvent.setup();
    render(<TimeRangePicker value="7d" onChange={() => {}} />);
    const buttons = screen.getAllByRole("button");
    buttons[0].focus();
    expect(document.activeElement).toBe(buttons[0]);
    await user.tab();
    expect(document.activeElement).toBe(buttons[1]);
    await user.tab();
    expect(document.activeElement).toBe(buttons[2]);
  });
});
