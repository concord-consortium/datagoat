// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LogMetricRow, type LogMetricRowProps } from "./LogMetricRow";
import { ADDABLE_PERFORMANCE } from "../../metrics/addableMetrics";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { COMPETITION_METRICS } from "../../metrics/competitionMetrics";
import {
  emptyCompetitionEntry,
  emptyHealthEntry,
  emptyPerformanceEntry,
} from "../../types/data";
import type { CustomMetricDef } from "../../types/customMetrics";
import type { TrackedMetric } from "./useTrackedMetrics";

const DATE = "2026-07-06";

type Overrides = Partial<
  Pick<
    LogMetricRowProps,
    "healthEntry" | "performanceEntry" | "competitionEntry" | "summary" | "summaryCell"
  >
> & {
  setValue?: LogMetricRowProps["setValue"];
  setAvailability?: LogMetricRowProps["setAvailability"];
};

function renderRow(tracked: TrackedMetric, o: Overrides = {}) {
  const setValue = o.setValue ?? vi.fn();
  const setAvailability = o.setAvailability ?? vi.fn();
  const { container } = render(
    <MemoryRouter>
      <table>
        <tbody>
          <LogMetricRow
            tracked={tracked}
            healthEntry={o.healthEntry ?? emptyHealthEntry(DATE)}
            performanceEntry={o.performanceEntry ?? emptyPerformanceEntry(DATE)}
            competitionEntry={o.competitionEntry ?? emptyCompetitionEntry(DATE)}
            summary={o.summary ?? {}}
            summaryCell={o.summaryCell ?? ""}
            competitionTerm="game"
            setValue={setValue}
            setAvailability={setAvailability}
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
  return { setValue, setAvailability, container };
}

function recordInput(metricId: string): HTMLInputElement {
  const input = document.querySelector(`[data-metric-id="${metricId}"]`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`no record input for "${metricId}"`);
  }
  return input;
}

function healthTracked(id: string): TrackedMetric {
  return {
    id,
    name: HEALTH_METRICS.find((m) => m.id === id)?.name ?? id,
    type: "health",
    section: "daily",
    builtInDef: HEALTH_METRICS.find((m) => m.id === id),
  };
}
function competitionTracked(id: string): TrackedMetric {
  return {
    id,
    name: COMPETITION_METRICS.find((m) => m.id === id)?.name ?? id,
    type: "competition",
    section: "asNeeded",
    builtInDef: COMPETITION_METRICS.find((m) => m.id === id),
  };
}
function performanceTracked(id: string): TrackedMetric {
  return {
    id,
    name: ADDABLE_PERFORMANCE.find((m) => m.id === id)?.name ?? id,
    type: "performance",
    section: "asNeeded",
    builtInDef: ADDABLE_PERFORMANCE.find((m) => m.id === id),
  };
}
function customTracked(def: CustomMetricDef): TrackedMetric {
  return { id: def.id, name: def.name, type: def.metricType, section: "daily", customDef: def };
}

function ordinalCustom(labels: Array<{ label: string; value: number }>): CustomMetricDef {
  return {
    id: "c_custom12345",
    ownerId: "u",
    name: "Custom Ordinal",
    metricType: "performance",
    primitive: "ordinal",
    inputType: "radio",
    referenceUrl: "",
    createdAt: 0,
    updatedAt: 0,
    levels: labels,
  };
}

describe("LogMetricRow", () => {
  it("links a health row to its detail page", () => {
    renderRow(healthTracked("hydration"));
    expect(screen.getByRole("link", { name: /Hydration/ }).getAttribute("href")).toBe(
      "/health/hydration",
    );
  });

  it("links a competition row to its detail page", () => {
    renderRow(competitionTracked("scores"));
    expect(screen.getByRole("link", { name: /Scores/ }).getAttribute("href")).toBe(
      "/competition/scores",
    );
  });

  it("reads a performance value from performanceEntry, not competitionEntry", () => {
    renderRow(performanceTracked("oneRepMaxBench"), {
      performanceEntry: { ...emptyPerformanceEntry(DATE), metrics: { oneRepMaxBench: 4.5 } },
      competitionEntry: { ...emptyCompetitionEntry(DATE), metrics: { oneRepMaxBench: 99 } },
    });
    expect(screen.getByRole("link", { name: /1 Rep Max Bench Press/ }).getAttribute("href")).toBe(
      "/performance/oneRepMaxBench",
    );
    expect(recordInput("oneRepMaxBench").value).toBe("4.5");
  });

  it("reads a competition value from competitionEntry, not performanceEntry", () => {
    renderRow(competitionTracked("scores"), {
      performanceEntry: { ...emptyPerformanceEntry(DATE), metrics: { scores: 4.5 } },
      competitionEntry: { ...emptyCompetitionEntry(DATE), metrics: { scores: 99 } },
    });
    expect(recordInput("scores").value).toBe("99");
  });

  it("renders a stored 0 rather than treating it as not-logged", () => {
    renderRow(competitionTracked("scores"), {
      competitionEntry: { ...emptyCompetitionEntry(DATE), metrics: { scores: 0 } },
    });
    expect(recordInput("scores").value).toBe("0");
  });

  it("writes a parsed numeric value through setValue", () => {
    const setValue = vi.fn();
    renderRow(performanceTracked("oneRepMaxBench"), {
      // Seed a real starting value so a "" -> "10" change is a genuine DOM change.
      performanceEntry: { ...emptyPerformanceEntry(DATE), metrics: { oneRepMaxBench: 4.5 } },
      setValue,
    });
    fireEvent.change(recordInput("oneRepMaxBench"), { target: { value: "10" } });
    expect(setValue).toHaveBeenCalledWith(10);
  });

  it("clears a numeric value to undefined when emptied", () => {
    const setValue = vi.fn();
    renderRow(healthTracked("sleepEfficiency"), {
      healthEntry: { ...emptyHealthEntry(DATE), sleepEfficiency: 50 },
      setValue,
    });
    fireEvent.change(recordInput("sleepEfficiency"), { target: { value: "" } });
    expect(setValue).toHaveBeenCalledWith(undefined);
  });

  it("renders a competition numeric row via NumericInput (queryable by data-metric-id)", () => {
    renderRow(competitionTracked("scores"));
    expect(recordInput("scores")).not.toBeNull();
  });

  it("renders a built-in ordinal as scale cards, never radio", () => {
    // winningPercentage is a built-in ordinal.
    renderRow(competitionTracked("winningPercentage"));
    expect(screen.getByTestId("scale-card-row")).toBeTruthy();
    expect(document.querySelector('input[type="radio"]')).toBeNull();
  });

  it("renders a Yes/No custom ordinal via LevelRadioGroup", () => {
    renderRow(
      customTracked(
        ordinalCustom([
          { label: "No", value: 0 },
          { label: "Yes", value: 1 },
        ]),
      ),
    );
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(2);
    expect(screen.queryByTestId("scale-card-row")).toBeNull();
  });

  it("renders a non-Yes/No custom ordinal via ScaleCards", () => {
    renderRow(
      customTracked(
        ordinalCustom([
          { label: "Low", value: 1 },
          { label: "High", value: 3 },
        ]),
      ),
    );
    expect(screen.getByTestId("scale-card-row")).toBeTruthy();
    expect(document.querySelector('input[type="radio"]')).toBeNull();
  });

  it("writes an ordinal selection through setValue as a number", () => {
    const setValue = vi.fn();
    renderRow(
      customTracked(
        ordinalCustom([
          { label: "No", value: 0 },
          { label: "Yes", value: 1 },
        ]),
      ),
      { setValue },
    );
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(setValue).toHaveBeenCalledWith(1);
  });

  it("renders the availability tree and does not write on mount", () => {
    const { setAvailability } = renderRow(healthTracked("availability"));
    expect(screen.getByRole("link", { name: /Availability/ })).toBeTruthy();
    expect(setAvailability).not.toHaveBeenCalled();
  });

  it("renders the relativeProteinIntake placeholder", () => {
    renderRow(healthTracked("relativeProteinIntake"));
    expect(screen.getByText(/Auto-calculated/)).toBeTruthy();
  });

  it("renders nothing for a nominal custom", () => {
    const def: CustomMetricDef = {
      id: "label",
      ownerId: "u",
      name: "Label",
      metricType: "performance",
      primitive: "nominal",
      inputType: "radio",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
      levels: [{ label: "A" }, { label: "B" }],
    };
    const { container } = renderRow(customTracked(def));
    expect(container.querySelector("tr")).toBeNull();
  });

  it("shows the competition summaryCell in the first column", () => {
    renderRow(competitionTracked("scores"), { summaryCell: "42" });
    expect(screen.getByText("42")).toBeTruthy();
  });
});
