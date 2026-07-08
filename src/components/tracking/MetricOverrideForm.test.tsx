// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
      profile: {
        gender: "male",
        athleteType: "endurance",
        competitionTerm: "match",
      },
    },
  }),
}));

import { setDoc } from "firebase/firestore";
import { MetricOverrideForm } from "./MetricOverrideForm";
import { MetricOverridesProvider } from "../../contexts/MetricOverridesContext";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { ADDABLE_PERFORMANCE } from "../../metrics/addableMetrics";
import type { MetricOverride } from "../../types/metricOverrides";

const mockedSetDoc = vi.mocked(setDoc);

const leanMass = HEALTH_METRICS.find((m) => m.id === "leanMass")!;
const hydration = HEALTH_METRICS.find((m) => m.id === "hydration")!;
const availability = HEALTH_METRICS.find((m) => m.id === "availability")!;
const fortyYardDash = ADDABLE_PERFORMANCE.find((m) => m.id === "fortyYardDash")!;
const oneRepMaxBench = ADDABLE_PERFORMANCE.find((m) => m.id === "oneRepMaxBench")!;
const sleepTime = HEALTH_METRICS.find((m) => m.id === "sleepTime")!;

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

  it("passes the profile's competition term into the Availability recommended-goal copy", () => {
    renderForm(availability);
    expect(
      screen.getByText(/Recommended goal: .*practices and matches/i),
    ).toBeInTheDocument();
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

  it("seeds the schedule editor from the built-in default", () => {
    // leanMass ships as yearly (count 2); the editor should reflect it.
    renderForm(leanMass);
    expect((screen.getByLabelText("Schedule") as HTMLSelectElement).value).toBe(
      "yearly",
    );
  });

  it("writes a schedule override when the user changes it", async () => {
    mockedSetDoc.mockClear();
    renderForm(leanMass);
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "75" },
    });
    fireEvent.change(screen.getByLabelText("Schedule"), {
      target: { value: "weekly" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/setup/tracking"),
    );
    // count (2) is preserved from the built-in default when only the
    // period changes.
    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ schedule: { period: "weekly", count: 2 } }),
      expect.anything(),
    );
  });

  it("does not write a schedule override when it matches the default", async () => {
    mockedSetDoc.mockClear();
    renderForm(leanMass);
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "75" },
    });
    // Schedule untouched (still yearly x2 = the built-in default).
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/setup/tracking"),
    );
    const payload = mockedSetDoc.mock.calls[0][1] as Record<string, unknown>;
    expect("schedule" in payload).toBe(false);
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

describe("MetricOverrideForm — time metric", () => {
  beforeEach(() => {
    navigateSpy.mockClear();
    mockedSetDoc.mockClear();
  });

  it("renders the goal as a time input (multiple fields) for a time metric", () => {
    renderForm(sleepTime);
    const goal = screen.getByTestId("mo-goal");
    expect(goal.querySelectorAll("input").length).toBeGreaterThanOrEqual(2);
  });

  it("renders the goal as a single number input for a non-time metric", () => {
    renderForm(leanMass);
    expect(screen.getByLabelText("Goal")).toHaveAttribute("type", "number");
  });

  it("renders the y-axis bounds as time inputs for a time metric", () => {
    renderForm(sleepTime);
    const top = screen.getByTestId("mo-ytop");
    const bottom = screen.getByTestId("mo-ybot");
    expect(top.querySelectorAll("input").length).toBeGreaterThanOrEqual(2);
    expect(bottom.querySelectorAll("input").length).toBeGreaterThanOrEqual(2);
  });

  it("blocks Save while a time field holds an invalid entry", async () => {
    renderForm(sleepTime);
    const goal = within(screen.getByTestId("mo-goal"));
    // An ambiguous 8.5hr + 40min entry never propagates to goalRaw; the
    // form must refuse to save the stale last-committed value.
    fireEvent.change(goal.getByLabelText("Goal Total Sleep Time min"), {
      target: { value: "40" },
    });
    fireEvent.change(goal.getByLabelText("Goal Total Sleep Time hr"), {
      target: { value: "8.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/fix the highlighted time fields/i)).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });

  it("shows the base y-axis bound as a placeholder on time fields", () => {
    renderForm(sleepTime);
    const top = within(screen.getByTestId("mo-ytop"));
    // The coarsest sub-field's placeholder is the base bound's value, not
    // the unit-label fallback - restoring the default hint time metrics
    // lost.
    expect(
      (top.getByLabelText("Y-axis top (optional) Total Sleep Time hr") as HTMLInputElement)
        .placeholder,
    ).toMatch(/^\d/);
  });

  it("gives each time field a distinct accessible name across Goal / Y-axis fields", () => {
    renderForm(sleepTime);
    // The three TimeInputs share one metric; the field-label prefix keeps
    // their per-unit inputs distinguishable for screen readers.
    expect(
      within(screen.getByTestId("mo-goal")).getByLabelText(
        "Goal Total Sleep Time hr",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("mo-ytop")).getByLabelText(
        "Y-axis top (optional) Total Sleep Time hr",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("mo-ybot")).getByLabelText(
        "Y-axis bottom (optional) Total Sleep Time hr",
      ),
    ).toBeInTheDocument();
  });

  it("round-trips a 7h30m goal entry to decimal 7.5 on save", async () => {
    renderForm(sleepTime);
    const goal = within(screen.getByTestId("mo-goal"));
    fireEvent.change(goal.getByLabelText("Goal Total Sleep Time hr"), {
      target: { value: "7" },
    });
    fireEvent.change(goal.getByLabelText("Goal Total Sleep Time min"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/setup/tracking"),
    );
    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ goalRaw: 7.5 }),
      expect.anything(),
    );
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
    // oneRepMaxBench has no timePrecision, so it still renders the
    // plain number TextField y-axis fields with base-config
    // placeholders (fortyYardDash is a time metric - see the DGT-19
    // "performance metric — time" describe block below).
    renderForm(oneRepMaxBench);
    expect(
      (screen.getByLabelText(/^Y-axis top/) as HTMLInputElement).placeholder,
    ).toBe("250");
    expect(
      (screen.getByLabelText(/^Y-axis bottom/) as HTMLInputElement).placeholder,
    ).toBe("0");
  });

  it("saves a valid perf override and navigates back", async () => {
    renderForm(oneRepMaxBench);
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "4.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/setup/tracking"),
    );
  });
});

describe("MetricOverrideForm — performance metric with seconds-only timePrecision", () => {
  beforeEach(() => {
    navigateSpy.mockClear();
  });

  it("renders fortyYardDash's Goal as a (single-field) time input, not a plain number field", () => {
    renderForm(fortyYardDash);
    const goal = screen.getByTestId("mo-goal");
    expect(goal.querySelector("input")).not.toBeNull();
    expect(goal.querySelector('input[type="number"]')).toBeNull();
  });

  it("saves a valid fortyYardDash override via its time input and navigates back", async () => {
    renderForm(fortyYardDash);
    const goal = within(screen.getByTestId("mo-goal"));
    fireEvent.change(goal.getByLabelText("Goal 40-Yard Dash sec"), {
      target: { value: "4.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/setup/tracking"),
    );
  });
});
