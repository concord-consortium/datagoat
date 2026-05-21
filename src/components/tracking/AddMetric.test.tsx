// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// CustomMetricsProvider now reads useAuth() unconditionally. These tests
// use the initialMetrics test seam (skipping Firestore), but still need
// a stub auth context for the provider to mount.
const stableAuth = vi.hoisted(() => ({
  user: { uid: "u1" } as { uid: string },
  loading: false,
  isEmailVerifiedOrTrusted: true,
  signOut: async () => {},
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => stableAuth,
}));

import { CustomMetricsProvider } from "../../contexts/CustomMetricsContext";
import type { CustomMetricDef } from "../../types/customMetrics";
import { AddMetric } from "./AddMetric";

function makeMetric(
  name: string,
  metricType: "health" | "performance" | "competition",
): CustomMetricDef {
  return {
    id: `c_test_${name.replace(/\s/g, "_")}`,
    ownerId: "u1",
    name,
    metricType,
    primitive: "numeric",
    inputType: "numeric",
    unit: "",
    goalRaw: 0,
    yTopRaw: 10,
    yBottomRaw: 0,
    avgDecimals: 1,
    referenceUrl: "",
    createdAt: 0,
    updatedAt: 0,
  };
}

function makePerfMetric(name: string): CustomMetricDef {
  return makeMetric(name, "performance");
}

function harness(path: string, seed: CustomMetricDef[] = []) {
  return render(
    <CustomMetricsProvider initialMetrics={seed}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/add-metric/:type" element={<AddMetric />} />
        </Routes>
      </MemoryRouter>
    </CustomMetricsProvider>,
  );
}

describe("AddMetric (demo)", () => {
  it("shows the empty-state hint when no customs exist", () => {
    harness("/add-metric/health");
    expect(screen.getByText(/none yet/i)).toBeInTheDocument();
  });

  it("renders user customs of the current type only", () => {
    harness("/add-metric/health", [
      makeMetric("Stretch Time", "health"),
      makeMetric("5K Time", "competition"),
    ]);
    expect(screen.getByText("Stretch Time")).toBeInTheDocument();
    expect(screen.queryByText("5K Time")).toBeNull();
  });

  it("always shows the + Create CTA", () => {
    harness("/add-metric/competition");
    expect(
      screen.getByRole("link", { name: /create custom metric/i }),
    ).toBeInTheDocument();
  });

  it("shows the empty-state hint for performance type", () => {
    harness("/add-metric/performance");
    expect(screen.getByText(/none yet/i)).toBeInTheDocument();
  });

  it("renders performance customs in the performance list", () => {
    harness("/add-metric/performance", [
      makePerfMetric("Sprint Drill"),
    ]);
    expect(screen.getByText("Sprint Drill")).toBeInTheDocument();
  });
});
