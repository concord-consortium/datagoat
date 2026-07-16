// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HealthMetricRow } from "./HealthMetricRow";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { emptyHealthEntry } from "../../types/data";
import type { TrackedMetric } from "./useTrackedMetrics";

const DATE = "2026-07-06";

function trackedFor(id: string): TrackedMetric {
  return {
    id,
    name: HEALTH_METRICS.find((m) => m.id === id)?.name ?? id,
    type: "health",
    section: "daily",
    builtInDef: HEALTH_METRICS.find((m) => m.id === id),
  };
}

function renderRow(
  id: string,
  setEntry = vi.fn(),
  entry = emptyHealthEntry(DATE),
) {
  render(
    <MemoryRouter>
      <table>
        <tbody>
          <HealthMetricRow
            tracked={trackedFor(id)}
            entry={entry}
            summary={{}}
            competitionTerm="game"
            setEntry={setEntry}
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
  return setEntry;
}

describe("HealthMetricRow", () => {
  it("renders the metric name linking to its detail page", () => {
    renderRow("hydration");
    const link = screen.getByRole("link", { name: /Hydration/ });
    expect(link.getAttribute("href")).toBe("/health/hydration");
  });

  it("writes a named numeric field", () => {
    const setEntry = renderRow("sleepEfficiency");
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "83" } });
    expect(setEntry).toHaveBeenCalledWith({ sleepEfficiency: 83 });
  });

  it("clears a named numeric field to undefined when emptied", () => {
    // Starts from a non-empty entry: a jsdom/React controlled-input quirk
    // means fireEvent.change from "" to "" never fires onChange at all
    // (the DOM value tracker sees no change), which would make this
    // assertion pass vacuously against a broken implementation too.
    // Starting from a real value makes the clear a genuine DOM change.
    const setEntry = renderRow("sleepEfficiency", vi.fn(), {
      ...emptyHealthEntry(DATE),
      sleepEfficiency: 50,
    });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    expect(setEntry).toHaveBeenCalledWith({ sleepEfficiency: undefined });
  });

  it("renders the placeholder for the auto-calculated metric", () => {
    renderRow("relativeProteinIntake");
    expect(screen.getByText(/Auto-calculated/)).toBeTruthy();
  });
});
