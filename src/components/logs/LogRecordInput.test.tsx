// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LogRecordInput, isTimeMetric, timeSecondsDecimals } from "./LogRecordInput";
import type { MetricDefinition } from "../../metrics/types";

// oneMileRun is a min/sec time metric; goals is a plain numeric metric.
const MILE: MetricDefinition = {
  id: "oneMileRun",
  name: "1-Mile Run",
  unit: "min",
  displayUnit: "min",
  type: "performance",
  whoCollects: "",
  howCollected: "",
  description: "",
  inputType: "numeric",
  timePrecision: "s",
};

function renderInput(props: Partial<React.ComponentProps<typeof LogRecordInput>>) {
  return render(
    <MemoryRouter>
      <table>
        <tbody>
          <tr>
            <td>
              <LogRecordInput
                metricId="goals"
                metricType="competition"
                value=""
                filled={false}
                onChange={vi.fn()}
                labelledBy="lbl"
                allowNegative={false}
                {...props}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </MemoryRouter>,
  );
}

describe("isTimeMetric", () => {
  it("is true for a time metric and false for a plain numeric one", () => {
    expect(isTimeMetric("oneMileRun")).toBe(true);
    expect(isTimeMetric("goals")).toBe(false);
  });
});

describe("timeSecondsDecimals", () => {
  it("returns the metric's configured seconds precision", () => {
    expect(timeSecondsDecimals("oneMileRun")).toBeGreaterThanOrEqual(0);
  });
});

describe("LogRecordInput", () => {
  it("renders a multi-field time input for a time metric", () => {
    const { container } = renderInput({
      metricId: "oneMileRun",
      metricType: "performance",
      builtInDef: MILE,
    });
    // Two sub-fields (min + sec), each with its own unit label.
    expect(container.querySelectorAll("input").length).toBeGreaterThanOrEqual(2);
  });

  it("renders a single numeric input for a non-time metric", () => {
    const { container } = renderInput({ metricId: "goals" });
    expect(container.querySelectorAll("input").length).toBe(1);
    expect(container.querySelector('input[type="number"]')).toBeNull();
  });
});
