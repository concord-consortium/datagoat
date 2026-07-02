// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TimeInput } from "./TimeInput";
import type { MetricDefinition } from "../../metrics/types";

const SLEEP: MetricDefinition = {
  id: "sleepTime",
  name: "Total Sleep Time",
  unit: "hr/night",
  displayUnit: "hr",
  type: "health",
  whoCollects: "",
  howCollected: "",
  description: "",
  inputType: "numeric",
  timePrecision: "m",
} as MetricDefinition;

function setup(value = "") {
  const onChange = vi.fn();
  const utils = render(
    <TimeInput metric={SLEEP} value={value} onChange={onChange} labelledBy="lbl" />,
  );
  const inputs = () => utils.container.querySelectorAll("input");
  return { onChange, inputs, ...utils };
}

describe("TimeInput (h:mm)", () => {
  it("seeds sub-fields from a stored decimal", () => {
    const { inputs } = setup("8.6667");
    const [h, m] = inputs();
    expect((h as HTMLInputElement).value).toBe("8");
    expect((m as HTMLInputElement).value).toBe("40");
  });

  it("fires String(decimal) when both fields are set", () => {
    const { inputs, onChange } = setup();
    const [h, m] = inputs();
    fireEvent.change(h, { target: { value: "8" } });
    fireEvent.change(m, { target: { value: "30" } });
    expect(Number(onChange.mock.calls.at(-1)![0])).toBeCloseTo(8.5, 6);
  });

  it("normalizes a coarsest decimal into the split on blur", () => {
    const { inputs, onChange } = setup();
    const [h, m] = inputs();
    fireEvent.change(h, { target: { value: "8.5" } });
    fireEvent.blur(h);
    expect((h as HTMLInputElement).value).toBe("8");
    expect((m as HTMLInputElement).value).toBe("30");
    expect(Number(onChange.mock.calls.at(-1)![0])).toBeCloseTo(8.5, 6);
  });

  it("shows an error and does not fire onChange for an ambiguous mix", () => {
    const { inputs, onChange, container } = setup();
    const [h, m] = inputs();
    fireEvent.change(m, { target: { value: "40" } });
    onChange.mockClear();
    fireEvent.change(h, { target: { value: "8.5" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/whole number/i);
  });

  it("fires empty string when all fields cleared", () => {
    const { inputs, onChange } = setup("8.5");
    const [h, m] = inputs();
    fireEvent.change(h, { target: { value: "" } });
    fireEvent.change(m, { target: { value: "" } });
    expect(onChange.mock.calls.at(-1)![0]).toBe("");
  });

  it("splits a pasted h:mm into fields", () => {
    const { inputs, onChange } = setup();
    fireEvent.change(inputs()[0], { target: { value: "8:40" } });
    expect(Number(onChange.mock.calls.at(-1)![0])).toBeCloseTo(8 + 40 / 60, 6);
  });
});
