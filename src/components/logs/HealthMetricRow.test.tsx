// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HealthMetricRow } from "./HealthMetricRow";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { emptyHealthEntry } from "../../types/data";
import type { CustomMetricDef } from "../../types/customMetrics";
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

function trackedForCustom(def: CustomMetricDef): TrackedMetric {
  return {
    id: def.id,
    name: def.name,
    type: "health",
    section: "daily",
    customDef: def,
  };
}

function renderCustomRow(def: CustomMetricDef, entry = emptyHealthEntry(DATE)) {
  const setEntry = vi.fn();
  const writeValue = vi.fn();
  render(
    <MemoryRouter>
      <table>
        <tbody>
          <HealthMetricRow
            tracked={trackedForCustom(def)}
            entry={entry}
            summary={{}}
            competitionTerm="game"
            setEntry={setEntry}
            writeValue={writeValue}
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
  return { setEntry, writeValue };
}

function renderRow(id: string, entry = emptyHealthEntry(DATE)) {
  const setEntry = vi.fn();
  const writeValue = vi.fn();
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
            writeValue={writeValue}
          />
        </tbody>
      </table>
    </MemoryRouter>,
  );
  return { setEntry, writeValue };
}

describe("HealthMetricRow", () => {
  it("renders the metric name linking to its detail page", () => {
    renderRow("hydration");
    const link = screen.getByRole("link", { name: /Hydration/ });
    expect(link.getAttribute("href")).toBe("/health/hydration");
  });

  it("writes a named numeric field", () => {
    const { writeValue } = renderRow("sleepEfficiency");
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "83" } });
    expect(writeValue).toHaveBeenCalledWith(83);
  });

  it("clears a named numeric field to undefined when emptied", () => {
    // Starts from a non-empty entry: a jsdom/React controlled-input quirk
    // means fireEvent.change from "" to "" never fires onChange at all
    // (the DOM value tracker sees no change), which would make this
    // assertion pass vacuously against a broken implementation too.
    // Starting from a real value makes the clear a genuine DOM change.
    const { writeValue } = renderRow("sleepEfficiency", {
      ...emptyHealthEntry(DATE),
      sleepEfficiency: 50,
    });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "" } });
    expect(writeValue).toHaveBeenCalledWith(undefined);
  });

  it("renders the placeholder for the auto-calculated metric", () => {
    renderRow("relativeProteinIntake");
    expect(screen.getByText(/Auto-calculated/)).toBeTruthy();
  });
});

describe("HealthMetricRow ordinal custom dispatch", () => {
  // ScaleCards and LevelRadioGroup both render `level.label` as visible text,
  // so text alone can't discriminate. ScaleCards marks each card row with
  // data-testid="scale-card-row"; LevelRadioGroup renders native
  // input[type="radio"] elements instead. Assert on those structural markers.
  const yesNoDef: CustomMetricDef = {
    id: "c_felt1234567",
    ownerId: "u1",
    name: "Felt Good",
    metricType: "health",
    primitive: "ordinal",
    inputType: "radio",
    referenceUrl: "",
    createdAt: 0,
    updatedAt: 0,
    levels: [
      { label: "No", value: 0 },
      { label: "Yes", value: 1 },
    ],
  };

  const scaleDef: CustomMetricDef = {
    id: "c_mood1234567",
    ownerId: "u1",
    name: "Mood",
    metricType: "health",
    primitive: "ordinal",
    inputType: "radio",
    referenceUrl: "",
    createdAt: 0,
    updatedAt: 0,
    levels: [
      { label: "Low", value: 1 },
      { label: "High", value: 3 },
    ],
  };

  it("renders a Yes/No-shaped ordinal custom via LevelRadioGroup", () => {
    renderCustomRow(yesNoDef);
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(2);
    expect(screen.queryByTestId("scale-card-row")).toBeNull();
  });

  it("renders a non-Yes/No-shaped ordinal custom via ScaleCards", () => {
    renderCustomRow(scaleDef);
    expect(screen.getByTestId("scale-card-row")).toBeTruthy();
    expect(document.querySelector('input[type="radio"]')).toBeNull();
  });

  it("renders the custom row's name as a link to its detail page", () => {
    // Regression: a custom row once rendered its name as plain text because
    // the MetricInputRow call site omitted detailHref.
    renderCustomRow(scaleDef);
    const link = screen.getByRole("link", { name: "Mood" });
    expect(link.getAttribute("href")).toBe("/health/c_mood1234567");
  });
});
