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
});
