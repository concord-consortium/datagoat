// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScheduleField } from "./ScheduleField";
import type { MetricSchedule } from "../../types/metricSchedule";

function renderField(value: MetricSchedule) {
  const onChange = vi.fn<(s: MetricSchedule) => void>();
  render(<ScheduleField value={value} onChange={onChange} />);
  return { onChange };
}

// A stateful host that feeds onChange back into value, so tests can
// exercise the real controlled round-trip (e.g. period changes that the
// component then reflects on the next render).
function StatefulField({ initial }: { initial: MetricSchedule }) {
  const [value, setValue] = useState(initial);
  return <ScheduleField value={value} onChange={setValue} />;
}

describe("ScheduleField", () => {
  it("reflects the current period in the select", () => {
    renderField({ period: "weekly" });
    const select = screen.getByLabelText("Schedule") as HTMLSelectElement;
    expect(select.value).toBe("weekly");
  });

  it("shows a count input for a periodic schedule", () => {
    renderField({ period: "daily", count: 3 });
    const count = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(count.value).toBe("3");
  });

  it("hides the count input when the schedule is irregular", () => {
    renderField({ period: "irregular" });
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("emits the chosen period, preserving the existing count", () => {
    const { onChange } = renderField({ period: "daily", count: 2 });
    fireEvent.change(screen.getByLabelText("Schedule"), {
      target: { value: "weekly" },
    });
    expect(onChange).toHaveBeenCalledWith({ period: "weekly", count: 2 });
  });

  it("drops count when switching to irregular", () => {
    const { onChange } = renderField({ period: "daily", count: 2 });
    fireEvent.change(screen.getByLabelText("Schedule"), {
      target: { value: "irregular" },
    });
    expect(onChange).toHaveBeenCalledWith({ period: "irregular" });
  });

  it("emits an updated count", () => {
    const { onChange } = renderField({ period: "weekly", count: 1 });
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "4" },
    });
    expect(onChange).toHaveBeenCalledWith({ period: "weekly", count: 4 });
  });

  it("falls back to 1 for a non-positive-integer count (no rounding)", () => {
    const { onChange } = renderField({ period: "weekly", count: 3 });
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "2.5" },
    });
    // 2.5 is rejected (not floored to 2) -> falls back to 1.
    expect(onChange).toHaveBeenCalledWith({ period: "weekly", count: 1 });
  });

  it("lets the user clear the count field without it snapping back", () => {
    renderField({ period: "weekly", count: 5 });
    const count = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(count, { target: { value: "" } });
    // The displayed field stays empty (the controlled value does not
    // immediately rewrite it to "1"), so the user can retype.
    expect(count.value).toBe("");
  });

  it("normalizes an empty/invalid count to the stored value on blur", () => {
    renderField({ period: "weekly", count: 5 });
    const count = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(count, { target: { value: "" } });
    fireEvent.blur(count);
    expect(count.value).toBe("1");
  });

  it("preserves the count across an irregular round-trip", () => {
    render(<StatefulField initial={{ period: "daily", count: 3 }} />);
    const select = screen.getByLabelText("Schedule");
    // daily(3) -> irregular -> daily again: the 3 must come back, not 1.
    fireEvent.change(select, { target: { value: "irregular" } });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    fireEvent.change(select, { target: { value: "daily" } });
    const count = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(count.value).toBe("3");
  });

  it("shows a read-only due-days summary for a weekly schedule", () => {
    renderField({ period: "weekly", count: 3 });
    expect(screen.getByText("Due: Mon, Wed, Fri")).toBeTruthy();
  });

  it("summarizes a daily schedule as due every day", () => {
    renderField({ period: "daily" });
    expect(screen.getByText("Due: Every day")).toBeTruthy();
  });

  it("omits the due-days summary for a period without weekday anchoring", () => {
    renderField({ period: "irregular" });
    expect(screen.queryByText(/^Due:/)).toBeNull();
  });

  it("hides the count input for a weekly schedule with an explicit days set", () => {
    // Editing a count could rewrite { period, count } and drop the authoritative
    // day-set, so the count field is hidden; the days show read-only instead.
    renderField({ period: "weekly", days: [1, 4] });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByText("Due: Mon, Thu")).toBeTruthy();
  });

  it("restores an explicit days set when the period returns to weekly", () => {
    const { onChange } = renderField({ period: "weekly", days: [1, 4] });
    fireEvent.change(screen.getByLabelText("Schedule"), {
      target: { value: "weekly" },
    });
    // The day set is authoritative, so it comes back as days - not as a
    // count-derived weekly schedule that would silently re-anchor to Wednesday.
    expect(onChange).toHaveBeenCalledWith({ period: "weekly", days: [1, 4] });
  });

  it("preserves an explicit days set across a period round-trip", () => {
    render(<StatefulField initial={{ period: "weekly", days: [1, 4] }} />);
    const select = screen.getByLabelText("Schedule");
    // weekly(Mon, Thu) -> monthly -> weekly: the day set must come back rather
    // than collapsing to the count-1 default of Wednesday.
    fireEvent.change(select, { target: { value: "monthly" } });
    expect(screen.queryByText(/^Due:/)).toBeNull();
    fireEvent.change(select, { target: { value: "weekly" } });
    expect(screen.getByText("Due: Mon, Thu")).toBeTruthy();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("drops days when leaving weekly, since days are weekly-only", () => {
    const { onChange } = renderField({ period: "weekly", days: [1, 4] });
    fireEvent.change(screen.getByLabelText("Schedule"), {
      target: { value: "monthly" },
    });
    expect(onChange).toHaveBeenCalledWith({ period: "monthly", count: 1 });
  });
});
