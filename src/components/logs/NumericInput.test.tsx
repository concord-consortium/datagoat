// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { NumericInput } from "./NumericInput";
import type { MetricDefinition } from "../../metrics/types";

const METRIC: MetricDefinition = {
  id: "protein",
  name: "Protein",
  unit: "g/kg/day",
  displayUnit: "g",
  type: "wellness",
  whoCollects: "",
  howCollected: "",
  description: "",
  inputType: "numeric",
};

function renderInput(initial = "") {
  const onChange = vi.fn();
  const utils = render(
    <NumericInput
      metric={METRIC}
      value={initial}
      onChange={onChange}
      labelledBy="lbl"
    />,
  );
  const input = utils.container.querySelector(
    "input[type='text']",
  ) as HTMLInputElement;
  return { input, onChange, ...utils };
}

describe("NumericInput", () => {
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
    const { input, onChange } = renderInput("5");
    fireEvent.change(input, { target: { value: "5a" } });
    // Reject leaves the prior local string in place; React reconciles
    // the controlled input back to "5" since onChange was not called.
    expect(input.value).toBe("5");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects multiple decimal points", () => {
    const { input, onChange } = renderInput("1.5");
    fireEvent.change(input, { target: { value: "1.5.2" } });
    expect(input.value).toBe("1.5");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects negative sign", () => {
    const { input, onChange } = renderInput("");
    fireEvent.change(input, { target: { value: "-1" } });
    expect(input.value).toBe("");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not revert local state when parent re-renders with round-trip-equivalent value", () => {
    // Parent keeps its own state, mimics WellnessLog/PerformanceLog: when
    // the user types "1.", the parent stores Number("1.") === 1 and
    // re-renders with value="1". Local state must hold "1." so the
    // trailing decimal survives until the user types another digit.
    function Harness() {
      const [parentValue, setParentValue] = useState("");
      return (
        <NumericInput
          metric={METRIC}
          value={parentValue}
          onChange={(raw) => {
            const n = raw === "" ? 0 : Number(raw);
            setParentValue(Number.isFinite(n) ? String(n) : parentValue);
          }}
          labelledBy="lbl"
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
    // Cross-tab edit / form reset: parent prop changes to a value that
    // doesn't round-trip to local; local must update.
    const { rerender, container } = render(
      <NumericInput
        metric={METRIC}
        value=""
        onChange={() => {}}
        labelledBy="lbl"
      />,
    );
    const input = container.querySelector(
      "input[type='text']",
    ) as HTMLInputElement;
    expect(input.value).toBe("");
    rerender(
      <NumericInput
        metric={METRIC}
        value="5"
        onChange={() => {}}
        labelledBy="lbl"
      />,
    );
    expect(input.value).toBe("5");
  });

  it("renders unit suffix from displayUnit", () => {
    const { container } = renderInput("");
    expect(container.textContent).toContain("g");
  });

  it("renders hint when metric has one", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NumericInput
        metric={{ ...METRIC, hint: "Entered 2-3x/yr" }}
        value=""
        onChange={onChange}
        labelledBy="lbl"
      />,
    );
    expect(container.textContent).toContain("Entered 2-3x/yr");
  });

  it("accepts a leading minus when allowNegative is set", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NumericInput
        metric={METRIC}
        value=""
        onChange={onChange}
        labelledBy="lbl"
        allowNegative
      />,
    );
    const input = container.querySelector(
      "input[type='text']",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-5" } });
    expect(input.value).toBe("-5");
    expect(onChange).toHaveBeenCalledWith("-5");
  });

  it("keeps a bare minus mid-typing when allowNegative is set", () => {
    // "-" alone parses to NaN, but the user is still typing — accept
    // it so they can finish the keystroke chain into "-5".
    const onChange = vi.fn();
    const { container } = render(
      <NumericInput
        metric={METRIC}
        value=""
        onChange={onChange}
        labelledBy="lbl"
        allowNegative
      />,
    );
    const input = container.querySelector(
      "input[type='text']",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-" } });
    expect(input.value).toBe("-");
    expect(onChange).toHaveBeenCalledWith("-");
  });
});
