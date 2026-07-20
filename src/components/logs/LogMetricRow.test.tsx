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

type RenderOverrides = Partial<
  Pick<LogMetricRowProps, "performanceEntry" | "competitionEntry" | "setPerformance" | "setCompetition">
>;

function renderRow(tracked: TrackedMetric, overrides: RenderOverrides = {}) {
  render(
    <MemoryRouter>
      <table>
        <tbody>
          <LogMetricRow
            tracked={tracked}
            healthEntry={emptyHealthEntry(DATE)}
            performanceEntry={overrides.performanceEntry ?? emptyPerformanceEntry(DATE)}
            competitionEntry={overrides.competitionEntry ?? emptyCompetitionEntry(DATE)}
            summary={{}}
            summaryCell=""
            competitionTerm="game"
            setHealth={vi.fn()}
            setPerformance={overrides.setPerformance ?? vi.fn()}
            setCompetition={overrides.setCompetition ?? vi.fn()}
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
}

// Value getter for the Record-cell numeric input. CompetitionMetricInput
// stamps `data-metric-id` on the raw <input>, which is the only stable hook
// available from outside (the accessible name is the row's metric name, not
// metric-specific).
function recordInput(metricId: string): HTMLInputElement {
  const input = document.querySelector(`[data-metric-id="${metricId}"]`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`no record input found for metric "${metricId}"`);
  }
  return input;
}

describe("LogMetricRow", () => {
  it("routes a health metric to the health row", () => {
    renderRow({
      id: "hydration",
      name: "Hydration",
      type: "health",
      section: "daily",
      builtInDef: HEALTH_METRICS.find((m) => m.id === "hydration"),
    });
    expect(screen.getByRole("link", { name: /Hydration/ }).getAttribute("href")).toBe(
      "/health/hydration",
    );
  });

  it("routes a competition metric to the shared perf/comp row", () => {
    renderRow({
      id: "scores",
      name: "Scores",
      type: "competition",
      section: "asNeeded",
      builtInDef: COMPETITION_METRICS.find((m) => m.id === "scores"),
    });
    expect(screen.getByRole("link", { name: /Scores/ }).getAttribute("href")).toBe(
      "/competition/scores",
    );
  });

  it("routes a performance metric to the shared perf/comp row and reads performanceEntry, not competitionEntry", () => {
    const tracked: TrackedMetric = {
      id: "oneRepMaxBench",
      name: "1 Rep Max Bench Press",
      type: "performance",
      section: "asNeeded",
      builtInDef: ADDABLE_PERFORMANCE.find((m) => m.id === "oneRepMaxBench"),
    };
    // Same metric id, deliberately different values in each entry so a
    // crossed wire (reading competitionEntry for a performance metric)
    // is observable rather than accidentally matching.
    renderRow(tracked, {
      performanceEntry: {
        ...emptyPerformanceEntry(DATE),
        metrics: { oneRepMaxBench: 4.5 },
      },
      competitionEntry: {
        ...emptyCompetitionEntry(DATE),
        metrics: { oneRepMaxBench: 99 },
      },
    });
    expect(screen.getByRole("link", { name: /1 Rep Max Bench Press/ }).getAttribute("href")).toBe(
      "/performance/oneRepMaxBench",
    );
    expect(recordInput("oneRepMaxBench").value).toBe("4.5");
  });

  it("reads a competition metric's value from competitionEntry, not performanceEntry", () => {
    const tracked: TrackedMetric = {
      id: "scores",
      name: "Scores",
      type: "competition",
      section: "asNeeded",
      builtInDef: COMPETITION_METRICS.find((m) => m.id === "scores"),
    };
    // Same metric id in both entries, deliberately different values.
    renderRow(tracked, {
      performanceEntry: {
        ...emptyPerformanceEntry(DATE),
        metrics: { scores: 4.5 },
      },
      competitionEntry: {
        ...emptyCompetitionEntry(DATE),
        metrics: { scores: 99 },
      },
    });
    expect(recordInput("scores").value).toBe("99");
  });

  it("fires setPerformance, not setCompetition, when editing a performance metric", () => {
    const setPerformance = vi.fn();
    const setCompetition = vi.fn();
    const tracked: TrackedMetric = {
      id: "oneRepMaxBench",
      name: "1 Rep Max Bench Press",
      type: "performance",
      section: "asNeeded",
      builtInDef: ADDABLE_PERFORMANCE.find((m) => m.id === "oneRepMaxBench"),
    };
    renderRow(tracked, {
      // Seed a real starting value: a "" -> "" change is swallowed by
      // React's value tracker and would never reach onChange, producing a
      // false negative against a correct implementation.
      performanceEntry: {
        ...emptyPerformanceEntry(DATE),
        metrics: { oneRepMaxBench: 4.5 },
      },
      setPerformance,
      setCompetition,
    });
    fireEvent.change(recordInput("oneRepMaxBench"), { target: { value: "10" } });
    expect(setPerformance).toHaveBeenCalledWith("10");
    expect(setCompetition).not.toHaveBeenCalled();
  });

  it("fires setCompetition, not setPerformance, when editing a competition metric", () => {
    const setPerformance = vi.fn();
    const setCompetition = vi.fn();
    const tracked: TrackedMetric = {
      id: "scores",
      name: "Scores",
      type: "competition",
      section: "asNeeded",
      builtInDef: COMPETITION_METRICS.find((m) => m.id === "scores"),
    };
    renderRow(tracked, {
      competitionEntry: {
        ...emptyCompetitionEntry(DATE),
        metrics: { scores: 4.5 },
      },
      setPerformance,
      setCompetition,
    });
    fireEvent.change(recordInput("scores"), { target: { value: "10" } });
    expect(setCompetition).toHaveBeenCalledWith("10");
    expect(setPerformance).not.toHaveBeenCalled();
  });

  it("renders nothing for a nominal custom", () => {
    const def: CustomMetricDef = {
      id: "label",
      ownerId: "u",
      name: "Label",
      metricType: "performance",
      primitive: "nominal",
      levels: [{ label: "A" }, { label: "B" }],
      inputType: "radio",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    };
    const tracked: TrackedMetric = {
      id: "label",
      name: "Label",
      type: "performance",
      section: "daily",
      customDef: def,
    };
    const { container } = render(
      <MemoryRouter>
        <table>
          <tbody>
            <LogMetricRow
              tracked={tracked}
              healthEntry={emptyHealthEntry(DATE)}
              performanceEntry={emptyPerformanceEntry(DATE)}
              competitionEntry={emptyCompetitionEntry(DATE)}
              summary={{}}
              summaryCell=""
              competitionTerm="game"
              setHealth={vi.fn()}
              setPerformance={vi.fn()}
              setCompetition={vi.fn()}
            />
          </tbody>
        </table>
      </MemoryRouter>,
    );
    expect(container.querySelector("tr")).toBeNull();
  });
});
