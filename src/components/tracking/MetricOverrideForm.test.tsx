// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  deleteField: () => ({ __delete: true }),
  // Variadic to handle the production path
  // `doc(db, "users", uid, "metricOverrides", metricId)`. Returning the
  // last segment as `id` matches Firestore's own semantics and keeps
  // any future setDoc assertions from being misled by a 3-arg shim.
  doc: (_db: unknown, ...segments: string[]) => ({
    id: segments[segments.length - 1],
    path: segments.join("/"),
  }),
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
import { ADDABLE_PERFORMANCE } from "../../metrics/addableMetrics";
import type { MetricOverride } from "../../types/metricOverrides";

const leanMass = HEALTH_METRICS.find((m) => m.id === "leanMass")!;
const hydration = HEALTH_METRICS.find((m) => m.id === "hydration")!;
const fortyYardDash = ADDABLE_PERFORMANCE.find((m) => m.id === "fortyYardDash")!;

function renderForm(metric = leanMass, overrides: MetricOverride[] = []) {
  return render(
    <MemoryRouter>
      <MetricOverridesProvider initialOverrides={overrides}>
        <MetricOverrideForm metric={metric} />
      </MetricOverridesProvider>
    </MemoryRouter>,
  );
}

describe("MetricOverrideForm", () => {
  beforeEach(() => {
    // navigateSpy is module-scope; clear between tests so a successful
    // save in an earlier case doesn't leak into a "rejects ..." case
    // that asserts on .not.toHaveBeenCalled.
    navigateSpy.mockClear();
  });

  it("renders Name and Unit disabled", () => {
    renderForm();
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByLabelText("Unit")).toBeDisabled();
  });

  it("leaves Goal and the y-axis fields editable", () => {
    renderForm();
    expect(screen.getByLabelText("Goal")).not.toBeDisabled();
    expect(screen.getByLabelText(/^Y-axis top/)).not.toBeDisabled();
    expect(screen.getByLabelText(/^Y-axis bottom/)).not.toBeDisabled();
  });

  it("shows a 'customized' note only when an override exists", () => {
    renderForm();
    expect(screen.queryByText(/has been customized/i)).toBeNull();
    renderForm(leanMass, [
      {
        // Doc id is just the metric id under the new
        // /users/{uid}/metricOverrides/{metricId} layout.
        id: "leanMass",
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

  it("renders the goal-determination guidance with the athlete type and metric name filled in", () => {
    renderForm(leanMass);
    expect(
      screen.getByText(
        /^As an Endurance athlete, your Lean Mass target should be tailored/,
      ),
    ).toBeInTheDocument();
    // The pre-DGT-48 generic placeholder must be gone.
    expect(
      screen.queryByText(/goal value determination will be shown here/i),
    ).toBeNull();
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

  it("rejects y-axis top <= bottom for an ascending metric", () => {
    renderForm(leanMass);
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "70" },
    });
    fireEvent.change(screen.getByLabelText(/^Y-axis top/), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText(/^Y-axis bottom/), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/top must be greater/i)).toBeInTheDocument();
  });

  it("rejects y-axis top >= bottom for an inverted metric (hydration)", () => {
    renderForm(hydration);
    fireEvent.change(screen.getByLabelText("Goal"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/^Y-axis top/), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText(/^Y-axis bottom/), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/top must be less/i)).toBeInTheDocument();
  });

  it("saves a valid override and navigates back", async () => {
    renderForm(leanMass);
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "75" },
    });
    fireEvent.change(screen.getByLabelText(/^Y-axis top/), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText(/^Y-axis bottom/), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/setup/tracking"),
    );
  });

  it("starts with blank y-axis fields when no override exists", () => {
    renderForm(leanMass);
    expect(
      (screen.getByLabelText(/^Y-axis top/) as HTMLInputElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText(/^Y-axis bottom/) as HTMLInputElement).value,
    ).toBe("");
  });

  it("rejects one-of-two y-axis fields blank as ambiguous", () => {
    renderForm(leanMass);
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "70" },
    });
    fireEvent.change(screen.getByLabelText(/^Y-axis top/), {
      target: { value: "120" },
    });
    // bottom left blank
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      screen.getByText(/both y-axis fields or leave both blank/i),
    ).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});

describe("MetricOverrideForm — performance metric", () => {
  beforeEach(() => {
    navigateSpy.mockClear();
  });

  it("renders the universal goal-determination guidance for perf metrics", () => {
    renderForm(fortyYardDash);
    expect(
      screen.getByText(
        /^As an Endurance athlete, your .+ target should be tailored/,
      ),
    ).toBeInTheDocument();
    // The perf-specific stopgap hint has been replaced by the
    // goal-determination text, which now covers every metric type.
    expect(
      screen.queryByText(/performance goals are personal/i),
    ).toBeNull();
  });

  it("uses the perf CONFIG bounds as y-axis placeholders", () => {
    renderForm(fortyYardDash);
    // fortyYardDash: from-sheet bounds 4.2..10 (sec).
    expect(
      (screen.getByLabelText(/^Y-axis top/) as HTMLInputElement).placeholder,
    ).toBe("10");
    expect(
      (screen.getByLabelText(/^Y-axis bottom/) as HTMLInputElement).placeholder,
    ).toBe("4.2");
  });

  it("saves a valid perf override and navigates back", async () => {
    renderForm(fortyYardDash);
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "4.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/setup/tracking"),
    );
  });
});
