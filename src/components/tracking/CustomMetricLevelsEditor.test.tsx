// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomMetricLevelsEditor } from "./CustomMetricLevelsEditor";
import type { CustomMetricLevel } from "../../types/customMetrics";

function renderEditor(initial: CustomMetricLevel[] = []) {
  const onChange = vi.fn<(next: CustomMetricLevel[]) => void>();
  function Host() {
    const [levels, setLevels] = useState<CustomMetricLevel[]>(initial);
    return (
      <CustomMetricLevelsEditor
        levels={levels}
        onChange={(next) => {
          setLevels(next);
          onChange(next);
        }}
      />
    );
  }
  const utils = render(<Host />);
  return { onChange, ...utils };
}

describe("CustomMetricLevelsEditor", () => {
  it("renders one row per level with label, value, color inputs", () => {
    renderEditor([
      { label: "Low", value: 1 },
      { label: "High", value: 3, color: "#f00" },
    ]);
    expect(screen.getAllByLabelText(/label/i)).toHaveLength(2);
    expect(screen.getAllByLabelText(/value/i)).toHaveLength(2);
    expect(screen.getAllByLabelText(/color/i)).toHaveLength(2);
  });

  it("calls onChange with the next array when 'add row' is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([{ label: "A", value: 1 }]);
    await user.click(screen.getByRole("button", { name: /add row/i }));
    expect(onChange).toHaveBeenLastCalledWith([
      { label: "A", value: 1 },
      { label: "", value: undefined },
    ]);
  });

  it("calls onChange with the next array when a label is edited", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([{ label: "A", value: 1 }]);
    const labelInput = screen.getByLabelText(/label/i);
    await user.clear(labelInput);
    await user.type(labelInput, "B");
    expect(onChange).toHaveBeenLastCalledWith([{ label: "B", value: 1 }]);
  });

  it("calls onChange with value coerced to number when value input changes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([{ label: "A", value: 1 }]);
    const valueInput = screen.getByLabelText(/value/i);
    await user.clear(valueInput);
    await user.type(valueInput, "5");
    expect(onChange).toHaveBeenLastCalledWith([{ label: "A", value: 5 }]);
  });

  it("removes a row when the remove button is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([
      { label: "A", value: 1 },
      { label: "B", value: 2 },
    ]);
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    await user.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith([{ label: "B", value: 2 }]);
  });

  it("renders read-only: disables inputs and hides Add/Remove buttons", () => {
    const onChange = vi.fn<(next: CustomMetricLevel[]) => void>();
    render(
      <CustomMetricLevelsEditor
        levels={[
          { label: "No", value: 0 },
          { label: "Yes", value: 1 },
        ]}
        onChange={onChange}
        readOnly
      />,
    );
    const inputs = screen
      .getAllByLabelText(/label|value|color/i)
      .filter((el): el is HTMLInputElement => el instanceof HTMLInputElement);
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((i) => i.disabled)).toBe(true);
    expect(screen.queryByRole("button", { name: /add row/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
  });
});
