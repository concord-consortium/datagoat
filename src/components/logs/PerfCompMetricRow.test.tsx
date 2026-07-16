// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PerfCompMetricRow } from "./PerfCompMetricRow";
import { COMPETITION_METRICS } from "../../metrics/competitionMetrics";
import type { TrackedMetric } from "./useTrackedMetrics";
import type { CustomMetricDef } from "../../types/customMetrics";

function trackedFor(id: string): TrackedMetric {
  const def = COMPETITION_METRICS.find((m) => m.id === id);
  return {
    id,
    name: def?.name ?? id,
    type: "competition",
    section: "asNeeded",
    builtInDef: def,
  };
}

function renderRow(
  id: string,
  opts: { value?: number | string; summaryCell?: string } = {},
) {
  const setValue = vi.fn();
  render(
    <MemoryRouter>
      <table>
        <tbody>
          <PerfCompMetricRow
            tracked={trackedFor(id)}
            value={opts.value}
            summaryCell={opts.summaryCell ?? ""}
            setValue={setValue}
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
  return setValue;
}

describe("PerfCompMetricRow", () => {
  it("renders the metric name linking to its detail page", () => {
    renderRow("scores");
    expect(screen.getByRole("link", { name: /Scores/ }).getAttribute("href")).toBe(
      "/competition/scores",
    );
  });

  it("renders the summary cell verbatim", () => {
    renderRow("scores", { summaryCell: "42" });
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("writes a numeric value", () => {
    const setValue = renderRow("scores");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "12" } });
    expect(setValue).toHaveBeenCalledWith("12");
  });

  it("renders Win/Loss cards (not radio inputs) for the ordinal built-in", () => {
    renderRow("winningPercentage");
    expect(screen.getByText("Win")).toBeTruthy();
    expect(screen.getByText("Loss")).toBeTruthy();
    // ScaleCards and LevelRadioGroup both render `level.label` as visible
    // text, so text alone can't tell them apart. ScaleCards marks its card
    // row with data-testid="scale-card-row"; LevelRadioGroup has no such
    // marker and renders native radio inputs instead. Assert the ScaleCards
    // structure so a regression that routes built-ins to LevelRadioGroup
    // (the originals never did) fails this test.
    expect(screen.getByTestId("scale-card-row")).toBeTruthy();
    expect(document.querySelector('input[type="radio"]')).toBeNull();
  });

  it("renders a stored 0 rather than treating it as not-logged", () => {
    renderRow("scores", { value: 0 });
    expect(screen.getByRole("textbox").getAttribute("value")).toBe("0");
  });

  it("renders the row but no input for a nominal custom metric", () => {
    // Nominal customs must not get a numeric input (it would corrupt the
    // entry shape). The ROW still renders - this matches the per-type pages,
    // where the nominal check lived inside the Record cell, not at row level.
    render(
      <MemoryRouter>
        <table>
          <tbody>
            <PerfCompMetricRow
              tracked={{
                id: "c-nominal",
                name: "Nominal Custom",
                type: "competition",
                section: "asNeeded",
                customDef: {
                  id: "c-nominal",
                  name: "Nominal Custom",
                  metricType: "competition",
                  primitive: "nominal",
                } as CustomMetricDef,
              }}
              value={undefined}
              summaryCell=""
              setValue={vi.fn()}
            />
          </tbody>
        </table>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /Nominal Custom/ })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
