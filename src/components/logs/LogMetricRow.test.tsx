// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LogMetricRow } from "./LogMetricRow";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { COMPETITION_METRICS } from "../../metrics/competitionMetrics";
import {
  emptyCompetitionEntry,
  emptyHealthEntry,
  emptyPerformanceEntry,
} from "../../types/data";
import type { TrackedMetric } from "./useTrackedMetrics";

const DATE = "2026-07-06";

function renderRow(tracked: TrackedMetric) {
  render(
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
});
