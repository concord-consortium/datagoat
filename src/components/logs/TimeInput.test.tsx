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
};

const MILE: MetricDefinition = {
  ...SLEEP,
  id: "oneMileRun",
  name: "1-Mile Run",
  unit: "min",
  displayUnit: "min",
  timePrecision: "s",
};

const SPRINT: MetricDefinition = {
  ...SLEEP,
  id: "fortyYardDash",
  name: "40-Yard Dash",
  unit: "sec",
  displayUnit: "sec",
  timePrecision: "s",
};

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

  it("notifies the parent when validity flips", () => {
    const onErrorChange = vi.fn();
    const { container } = render(
      <TimeInput
        metric={SLEEP}
        value=""
        onChange={vi.fn()}
        labelledBy="lbl"
        onErrorChange={onErrorChange}
      />,
    );
    const [h, m] = container.querySelectorAll("input");
    fireEvent.change(m, { target: { value: "40" } });
    fireEvent.change(h, { target: { value: "8.5" } }); // ambiguous
    expect(onErrorChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(h, { target: { value: "8" } }); // resolved
    expect(onErrorChange).toHaveBeenLastCalledWith(false);
  });
});

describe("TimeInput seconds-only paste", () => {
  it("reads a pasted stopwatch value as m:s instead of dropping it", () => {
    const onChange = vi.fn();
    const { container } = render(
      <TimeInput metric={SPRINT} value="" onChange={onChange} labelledBy="lbl" />,
    );
    fireEvent.change(container.querySelector("input")!, {
      target: { value: "1:30" },
    });
    expect(Number(onChange.mock.calls.at(-1)![0])).toBeCloseTo(90, 6);
  });
});

describe("TimeInput IME composition", () => {
  it("validates and commits the composed value on composition end", () => {
    const onChange = vi.fn();
    const { container } = render(
      <TimeInput metric={MILE} value="" onChange={onChange} labelledBy="lbl" />,
    );
    const [, s] = container.querySelectorAll("input");
    fireEvent.compositionStart(s);
    fireEvent.compositionEnd(s, { target: { value: "45" } });
    expect(Number(onChange.mock.calls.at(-1)![0])).toBeCloseTo(45 / 60, 6);
    expect((s as HTMLInputElement).value).toBe("45");
  });

  it("reverts a field when composition ends on non-numeric input", () => {
    const onChange = vi.fn();
    const { container } = render(
      <TimeInput metric={MILE} value="" onChange={onChange} labelledBy="lbl" />,
    );
    const [, s] = container.querySelectorAll("input");
    fireEvent.compositionStart(s); // captures the pre-composition value ("")
    fireEvent.compositionEnd(s, { target: { value: "4a" } });
    expect((s as HTMLInputElement).value).toBe(""); // reverted, not committed
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("TimeInput seconds/minutes range error", () => {
  it("shows a range message, not the ambiguity message, for seconds at or over 60", () => {
    const onChange = vi.fn();
    const { container } = render(
      <TimeInput metric={MILE} value="" onChange={onChange} labelledBy="lbl" />,
    );
    const [, s] = container.querySelectorAll("input");
    fireEvent.change(s, { target: { value: "75" } });
    expect(container.textContent).toMatch(/less than 60/i);
    expect(container.textContent).not.toMatch(/whole number/i);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the range message for a colon paste with an out-of-range piece", () => {
    const onChange = vi.fn();
    const { container } = render(
      <TimeInput metric={MILE} value="" onChange={onChange} labelledBy="lbl" />,
    );
    fireEvent.change(container.querySelectorAll("input")[0], {
      target: { value: "1:75" },
    });
    expect(container.textContent).toMatch(/less than 60/i);
    expect(container.textContent).not.toMatch(/whole number/i);
    expect(onChange).not.toHaveBeenCalled();
  });
});
