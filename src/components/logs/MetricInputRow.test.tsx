// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MetricInputRow } from "./MetricInputRow";
import type { MetricDefinition } from "../../metrics/types";
import type { CustomMetricLevel } from "../../types/customMetrics";

const HYDRATION: MetricDefinition = {
  id: "hydration",
  name: "Hydration",
  unit: "level",
  type: "health",
  whoCollects: "",
  howCollected: "",
  description: "",
  inputType: "colorScale",
  max: 8,
};

function renderColorScale(initial = 0) {
  const onChange = vi.fn<(next: number) => void>();
  const utils = render(
    <MemoryRouter>
      <table>
        <tbody>
          <MetricInputRow
            inputType="colorScale"
            metric={HYDRATION}
            value={initial}
            onChange={onChange}
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
  const swatches = Array.from(
    utils.container.querySelectorAll("button[aria-checked]"),
  ) as HTMLButtonElement[];
  return { onChange, swatches, ...utils };
}

describe("MetricInputRow ColorScale", () => {
  it("renders one swatch per level up to max", () => {
    const { swatches } = renderColorScale();
    expect(swatches).toHaveLength(8);
    expect(swatches[0].getAttribute("aria-label")).toBe("1 of 8");
    expect(swatches[7].getAttribute("aria-label")).toBe("8 of 8");
  });

  it("marks selected swatch with aria-checked and tabIndex 0", () => {
    const { swatches } = renderColorScale(3);
    expect(swatches[2].getAttribute("aria-checked")).toBe("true");
    expect(swatches[2].tabIndex).toBe(0);
    expect(swatches[0].getAttribute("aria-checked")).toBe("false");
    expect(swatches[0].tabIndex).toBe(-1);
  });

  it("when value is undefined (fresh entry), first swatch is the tab stop", () => {
    const onChange = vi.fn<(next: number) => void>();
    const utils = render(
      <MemoryRouter>
        <table>
          <tbody>
            <MetricInputRow
              inputType="colorScale"
              metric={HYDRATION}
              value={undefined}
              onChange={onChange}
            />
          </tbody>
        </table>
      </MemoryRouter>,
    );
    const swatches = Array.from(
      utils.container.querySelectorAll("button[aria-checked]"),
    ) as HTMLButtonElement[];
    expect(swatches[0].tabIndex).toBe(0);
    expect(swatches[1].tabIndex).toBe(-1);
  });

  it("ArrowRight advances and fires onChange", () => {
    const { swatches, onChange } = renderColorScale(0);
    fireEvent.keyDown(swatches[0], { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("ArrowDown behaves like ArrowRight", () => {
    const { swatches, onChange } = renderColorScale(0);
    fireEvent.keyDown(swatches[0], { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("ArrowRight at the right edge is a no-op (does not fire onChange)", () => {
    const { swatches, onChange } = renderColorScale(8);
    fireEvent.keyDown(swatches[7], { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ArrowLeft retreats from interior swatch", () => {
    const { swatches, onChange } = renderColorScale(3);
    fireEvent.keyDown(swatches[2], { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("ArrowLeft at the left edge is a no-op (no wraparound, no onChange)", () => {
    const { swatches, onChange } = renderColorScale(1);
    fireEvent.keyDown(swatches[0], { key: "ArrowLeft" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ArrowUp behaves like ArrowLeft", () => {
    const { swatches, onChange } = renderColorScale(3);
    fireEvent.keyDown(swatches[2], { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("number keys jump directly to that level", () => {
    const { swatches, onChange } = renderColorScale(0);
    fireEvent.keyDown(swatches[0], { key: "5" });
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("number keys above max are ignored", () => {
    const { swatches, onChange } = renderColorScale(0);
    fireEvent.keyDown(swatches[0], { key: "9" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("non-arrow non-number keys are ignored", () => {
    const { swatches, onChange } = renderColorScale(0);
    fireEvent.keyDown(swatches[0], { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clicking a swatch selects that level", () => {
    const { swatches, onChange } = renderColorScale(0);
    fireEvent.click(swatches[4]);
    expect(onChange).toHaveBeenCalledWith(5);
  });
});

const MOOD_LEVELS: CustomMetricLevel[] = [
  { label: "Low", value: 1 },
  { label: "Mid", value: 3 },
  { label: "High", value: 5 },
];

const MOOD_METRIC: MetricDefinition = {
  id: "c_mood",
  name: "Mood",
  unit: "",
  type: "health",
  whoCollects: "",
  howCollected: "",
  description: "",
  inputType: "radio",
};

function renderOrdinal(initial: number | undefined = undefined) {
  const onChange = vi.fn<(next: number) => void>();
  const utils = render(
    <MemoryRouter>
      <table>
        <tbody>
          <MetricInputRow
            inputType="ordinal"
            metric={MOOD_METRIC}
            levels={MOOD_LEVELS}
            value={initial}
            onChange={onChange}
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
  return { onChange, ...utils };
}

describe("MetricInputRow Ordinal", () => {
  it("renders one card per level with the label as visible text", () => {
    renderOrdinal();
    expect(screen.getByRole("radio", { name: /^low$/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^mid$/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^high$/i })).toBeTruthy();
  });

  it("marks the selected level via aria-checked", () => {
    renderOrdinal(3);
    expect(
      screen.getByRole("radio", { name: /^mid$/i }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("fires onChange with the numeric value when a level is clicked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderOrdinal();
    await user.click(screen.getByRole("radio", { name: /^high$/i }));
    expect(onChange).toHaveBeenCalledWith(5);
  });
});

const MOOD_FACE_LEVELS: CustomMetricLevel[] = [
  { label: "Very sad", value: 1 },
  { label: "Neutral", value: 3 },
  { label: "Very happy", value: 5 },
];

const MOOD_BUILTIN: MetricDefinition = {
  id: "mood",
  name: "Mood",
  unit: "",
  type: "health",
  whoCollects: "",
  howCollected: "",
  description: "",
  inputType: "ordinal",
};

describe("MetricInputRow radio (Yes/No)", () => {
  it("renders radio buttons for inputType='radio'", () => {
    render(
      <MemoryRouter>
        <table>
          <tbody>
            <MetricInputRow
              inputType="radio"
              metric={MOOD_METRIC}
              levels={[
                { label: "No", value: 0 },
                { label: "Yes", value: 1 },
              ]}
              value={undefined}
              onChange={vi.fn()}
            />
          </tbody>
        </table>
      </MemoryRouter>,
    );
    const no = screen.getByRole("radio", { name: /^no$/i });
    expect(no).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^yes$/i })).toBeTruthy();
    // Native <input type="radio">, not the scale-card picker (whose cards are
    // <button role="radio">). Both expose role=radio, so distinguish by element.
    expect(no.tagName).toBe("INPUT");
  });
});

describe("MetricInputRow Mood face icons", () => {
  it("renders a face-icon card whose accessible name is the level word", () => {
    render(
      <MemoryRouter>
        <table>
          <tbody>
            <MetricInputRow
              inputType="ordinal"
              metric={MOOD_BUILTIN}
              levels={MOOD_FACE_LEVELS}
              value={undefined}
              onChange={vi.fn()}
            />
          </tbody>
        </table>
      </MemoryRouter>,
    );
    const happy = screen.getByRole("radio", { name: /very happy/i });
    // The visible content is a decorative face icon (svg), not text.
    expect(happy.querySelector("svg")).toBeTruthy();
    expect(happy.textContent).toBe("");
  });
});

const timeBase = {
  name: "M",
  type: "health" as const,
  whoCollects: "",
  howCollected: "",
  description: "",
  inputType: "numeric" as const,
};

function renderTimeRoutingRow(metric: MetricDefinition, value: string) {
  return render(
    <MemoryRouter>
      <table>
        <tbody>
          <MetricInputRow
            metric={metric}
            inputType="numeric"
            value={value}
            onChange={vi.fn()}
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
}

describe("MetricInputRow time routing", () => {
  it("renders two fields for a time metric (h:mm)", () => {
    const sleep: MetricDefinition = {
      ...timeBase,
      id: "sleepTime",
      unit: "hr",
      displayUnit: "hr",
      timePrecision: "m",
    };
    const { container } = renderTimeRoutingRow(sleep, "8.5");
    expect(container.querySelectorAll("input").length).toBe(2);
  });

  it("renders a single numeric input for a non-time metric", () => {
    const protein: MetricDefinition = {
      ...timeBase,
      id: "protein",
      unit: "g",
      displayUnit: "g",
    };
    const { container } = renderTimeRoutingRow(protein, "1.4");
    expect(container.querySelectorAll("input").length).toBe(1);
  });
});

describe("MetricInputRow placeholder", () => {
  const RPI: MetricDefinition = {
    id: "relativeProteinIntake",
    name: "Relative Protein Intake",
    unit: "",
    type: "health",
    whoCollects: "",
    howCollected: "",
    description: "",
    inputType: "numeric",
  };

  it("renders the placeholder text and a name link", () => {
    render(
      <MemoryRouter>
        <table>
          <tbody>
            <MetricInputRow
              inputType="placeholder"
              metric={RPI}
              detailHref="/health/relativeProteinIntake"
            />
          </tbody>
        </table>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Auto-calculated/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Relative Protein Intake/ }).getAttribute("href"),
    ).toBe("/health/relativeProteinIntake");
  });
});
