// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScheduleField } from "./ScheduleField";
import type { MetricSchedule } from "../../types/metricSchedule";

function renderField(value: MetricSchedule) {
  const onChange = vi.fn<(s: MetricSchedule) => void>();
  render(<ScheduleField value={value} onChange={onChange} />);
  return { onChange };
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
});
