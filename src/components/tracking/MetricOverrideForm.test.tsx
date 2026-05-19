// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  onSnapshot: () => () => {},
  query: () => ({}),
  serverTimestamp: () => ({ __ts: true }),
  setDoc: vi.fn(async () => {}),
  where: () => ({}),
}));
vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1" } }),
}));
vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({
    loadState: {
      status: "loaded",
      profile: { gender: "male", athleteType: "endurance" },
    },
  }),
}));

import { MetricOverrideForm } from "./MetricOverrideForm";
import { MetricOverridesProvider } from "../../contexts/MetricOverridesContext";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import type { MetricOverride } from "../../types/metricOverrides";

const leanMass = HEALTH_METRICS.find((m) => m.id === "leanMass")!;
const hydration = HEALTH_METRICS.find((m) => m.id === "hydration")!;

function renderForm(metric = leanMass, overrides: MetricOverride[] = []) {
  return render(
    <MemoryRouter>
      <MetricOverridesProvider initialOverrides={overrides}>
        <MetricOverrideForm type="health" metric={metric} />
      </MetricOverridesProvider>
    </MemoryRouter>,
  );
}

describe("MetricOverrideForm", () => {
  it("renders Name and Unit disabled", () => {
    renderForm();
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByLabelText("Unit")).toBeDisabled();
  });

  it("leaves Goal and the y-axis fields editable", () => {
    renderForm();
    expect(screen.getByLabelText("Goal")).not.toBeDisabled();
    expect(screen.getByLabelText("Y-axis top")).not.toBeDisabled();
    expect(screen.getByLabelText("Y-axis bottom")).not.toBeDisabled();
  });

  it("shows a 'customized' note only when an override exists", () => {
    renderForm();
    expect(screen.queryByText(/has been customized/i)).toBeNull();
    renderForm(leanMass, [
      {
        id: "u1_leanMass",
        ownerId: "u1",
        metricId: "leanMass",
        goalRaw: 70,
        yTopRaw: 90,
        yBottomRaw: 40,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    expect(
      screen.getAllByText(/has been customized/i).length,
    ).toBeGreaterThan(0);
  });

  it("rejects a goal outside the metric's [min, max] range", () => {
    renderForm(hydration);
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "99" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/between 1 and 8/i)).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("saves a valid override and navigates back", async () => {
    renderForm(leanMass);
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "75" },
    });
    fireEvent.change(screen.getByLabelText("Y-axis top"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Y-axis bottom"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/setup/tracking"),
    );
  });
});
