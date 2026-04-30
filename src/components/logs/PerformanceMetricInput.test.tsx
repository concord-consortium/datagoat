// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { PerformanceMetricInput } from "./PerformanceMetricInput";

function renderInput(initial = "", filled = false) {
  const onChange = vi.fn();
  const utils = render(
    <PerformanceMetricInput
      metricId="goals"
      labelledBy="lbl"
      value={initial}
      filled={filled}
      onChange={onChange}
    />,
  );
  const input = utils.container.querySelector(
    "input[type='text']",
  ) as HTMLInputElement;
  return { input, onChange, ...utils };
}

describe("PerformanceMetricInput", () => {
  it("keeps trailing decimal", () => {
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: "1." } });
    expect(input.value).toBe("1.");
    expect(onChange).toHaveBeenCalledWith("1.");
  });

  it("keeps bare zero", () => {
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: "0" } });
    expect(input.value).toBe("0");
    expect(onChange).toHaveBeenCalledWith("0");
  });

  it("keeps leading zero", () => {
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: "07" } });
    expect(input.value).toBe("07");
    expect(onChange).toHaveBeenCalledWith("07");
  });

  it("rejects letters", () => {
    const { input, onChange } = renderInput("5", true);
    fireEvent.change(input, { target: { value: "5a" } });
    expect(input.value).toBe("5");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects multiple decimal points", () => {
    const { input, onChange } = renderInput("1.5", true);
    fireEvent.change(input, { target: { value: "1.5.2" } });
    expect(input.value).toBe("1.5");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects negative sign", () => {
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: "-1" } });
    expect(input.value).toBe("");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not revert local state when parent re-renders with round-trip-equivalent value", () => {
    function Harness() {
      const [parentValue, setParentValue] = useState("");
      return (
        <PerformanceMetricInput
          metricId="goals"
          labelledBy="lbl"
          value={parentValue}
          filled={parentValue !== ""}
          onChange={(raw) => {
            const n = raw === "" ? 0 : Number(raw);
            setParentValue(Number.isFinite(n) ? String(n) : parentValue);
          }}
        />
      );
    }
    const { container } = render(<Harness />);
    const input = container.querySelector(
      "input[type='text']",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1." } });
    expect(input.value).toBe("1.");
  });

  it("reconciles local state when parent prop changes to a non-round-trip value", () => {
    const { rerender, container } = render(
      <PerformanceMetricInput
        metricId="goals"
        labelledBy="lbl"
        value=""
        filled={false}
        onChange={() => {}}
      />,
    );
    const input = container.querySelector(
      "input[type='text']",
    ) as HTMLInputElement;
    expect(input.value).toBe("");
    rerender(
      <PerformanceMetricInput
        metricId="goals"
        labelledBy="lbl"
        value="5"
        filled={true}
        onChange={() => {}}
      />,
    );
    expect(input.value).toBe("5");
  });

  it("forwards data-metric-id for CODAP integration / test selectors", () => {
    const { input } = renderInput();
    expect(input.getAttribute("data-metric-id")).toBe("goals");
  });
});
