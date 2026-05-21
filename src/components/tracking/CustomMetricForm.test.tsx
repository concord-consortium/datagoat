// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  onSnapshot: (_q: unknown, listener: (snap: { forEach: (cb: (d: unknown) => void) => void }) => void) => {
    listener({ forEach: () => {} });
    return () => {};
  },
  query: () => ({}),
  serverTimestamp: () => ({ toMillis: () => Date.now() }),
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  where: () => ({}),
}));
vi.mock("../../firebase", () => ({ db: {} }));

const stableAuth = vi.hoisted(() => ({
  user: { uid: "u1" } as { uid: string },
  loading: false,
  isEmailVerifiedOrTrusted: true,
  signOut: async () => {},
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => stableAuth,
}));

// Stable mock for useUser. The form auto-tracks newly created metrics
// via setTrackedMetrics; the test doesn't assert on persistence so a
// noop is fine. vi.hoisted keeps the same object instance across calls
// so any in-effect dep on the result doesn't re-fire on every render.
const userMock = vi.hoisted(() => ({
  loadState: { status: "missing" as const },
  updateProfile: vi.fn<(patch: Record<string, unknown>) => Promise<void>>(
    async () => {},
  ),
  setTrackedMetrics: vi.fn<
    (type: "health" | "performance" | "competition", ids: string[]) => Promise<void>
  >(async () => {}),
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => userMock,
}));

vi.mock("../../contexts/DataContext", async () => {
  // Import inside the async factory so we get the real
  // emptyHealthEntry — vi.mock factories are hoisted above static
  // imports, so we cannot reach top-level imports from here.
  const { emptyHealthEntry } = await import("../../types/data");
  return {
    useData: () => ({
      health: {
        status: "loaded",
        entries: [
          {
            ...emptyHealthEntry("2026-05-01"),
            customMetrics: { c_x: 30 },
          },
        ],
      },
      competition: { status: "loaded", entries: [] },
      setHealthEntry: vi.fn(),
      setCompetitionEntry: vi.fn(),
    }),
  };
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { setDoc as mockedSetDoc } from "firebase/firestore";
import { CustomMetricsProvider } from "../../contexts/CustomMetricsContext";
import { MetricOverridesProvider } from "../../contexts/MetricOverridesContext";
import type { CustomMetricDef } from "../../types/customMetrics";
import { CustomMetricForm } from "./CustomMetricForm";

// Probe the current route's pathname into the DOM so a redirect can be
// asserted by reading testid="loc" rather than spying on history.
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CustomMetricsProvider>
        <MetricOverridesProvider initialOverrides={[]}>
          <Routes>
            <Route path="/add-metric/:type/new" element={<CustomMetricForm />} />
            <Route path="/add-metric/:type/:metricId" element={<CustomMetricForm />} />
            <Route path="/setup/tracking" element={<div>back to tracking setup</div>} />
          </Routes>
        </MetricOverridesProvider>
      </CustomMetricsProvider>
    </MemoryRouter>,
  );
}

describe("CustomMetricForm (create)", () => {
  it("requires a name", async () => {
    const user = userEvent.setup();
    renderAt("/add-metric/health/new");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });

  it("saves a numeric metric on submit and navigates back", async () => {
    const user = userEvent.setup();
    renderAt("/add-metric/health/new");

    await user.type(screen.getByLabelText(/name/i), "Stretch Minutes");
    await user.type(screen.getByLabelText(/unit/i), "min");
    await user.clear(screen.getByLabelText(/goal/i));
    await user.type(screen.getByLabelText(/goal/i), "15");
    await user.clear(screen.getByLabelText(/y-axis top/i));
    await user.type(screen.getByLabelText(/y-axis top/i), "60");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText("back to tracking setup")).toBeInTheDocument();
    });
    expect(mockedSetDoc).toHaveBeenCalledTimes(1);
    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "Stretch Minutes",
        metricType: "health",
        unit: "min",
        goalRaw: 15,
        referenceUrl: "",
      }),
    );
  });

  it("persists a valid Reference URL when provided", async () => {
    const user = userEvent.setup();
    renderAt("/add-metric/health/new");

    await user.type(screen.getByLabelText(/name/i), "Stretch Minutes");
    await user.type(
      screen.getByLabelText(/reference url/i),
      "https://example.com/stretch",
    );
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText("back to tracking setup")).toBeInTheDocument();
    });
    expect(mockedSetDoc).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        referenceUrl: "https://example.com/stretch",
      }),
    );
  });

  it("rejects an invalid Reference URL with a clear error", async () => {
    const user = userEvent.setup();
    renderAt("/add-metric/health/new");

    await user.type(screen.getByLabelText(/name/i), "Stretch Minutes");
    await user.type(
      screen.getByLabelText(/reference url/i),
      "not a url",
    );
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(
      screen.getByText(/reference url must be a valid/i),
    ).toBeInTheDocument();
    // The form must NOT navigate away when validation fails.
    expect(screen.queryByText("back to tracking setup")).toBeNull();
  });

  it("rejects javascript: and other non-http(s) protocols on the Reference URL", async () => {
    // `new URL("javascript:alert(1)")` parses successfully, but
    // rendering that into <a href> would execute arbitrary code on
    // click. The protocol guard restricts to http(s).
    const user = userEvent.setup();
    renderAt("/add-metric/health/new");

    await user.type(screen.getByLabelText(/name/i), "Stretch Minutes");
    await user.type(
      screen.getByLabelText(/reference url/i),
      "javascript:alert(1)",
    );
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(
      screen.getByText(/http:\/\/ or https:\/\//i),
    ).toBeInTheDocument();
    expect(screen.queryByText("back to tracking setup")).toBeNull();
  });
});

describe("CustomMetricForm (edit confirmation)", () => {
  it("prompts before saving a unit change when entries exist", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const seed: CustomMetricDef[] = [
      {
        id: "c_x",
        ownerId: "u1",
        name: "Stretch Minutes",
        metricType: "health",
        primitive: "numeric",
        inputType: "numeric",
        unit: "min",
        goalRaw: 15,
        yTopRaw: 60,
        yBottomRaw: 0,
        avgDecimals: 1,
        referenceUrl: "",
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    render(
      <CustomMetricsProvider initialMetrics={seed}>
        <MemoryRouter initialEntries={["/add-metric/health/c_x"]}>
          <Routes>
            <Route
              path="/add-metric/:type/:metricId"
              element={<CustomMetricForm />}
            />
            <Route
              path="/setup/tracking"
              element={<div>back to tracking setup</div>}
            />
          </Routes>
        </MemoryRouter>
      </CustomMetricsProvider>,
    );

    await user.clear(screen.getByLabelText(/unit/i));
    await user.type(screen.getByLabelText(/unit/i), "minutes");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/unit/i);
    expect(screen.queryByText("back to tracking setup")).toBeNull();

    confirmSpy.mockRestore();
  });

  it("prompts before saving a level-values change when entries exist", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    // c_x is the id the DataContext mock seeds an entry for, so
    // hasEntriesForMetric("c_x") returns true at submit time.
    const seed: CustomMetricDef[] = [
      {
        id: "c_x",
        ownerId: "u1",
        name: "Mood",
        metricType: "health",
        primitive: "ordinal",
        inputType: "radio",
        levels: [
          { label: "Low", value: 1 },
          { label: "High", value: 5 },
        ],
        yTopRaw: 5,
        yBottomRaw: 1,
        avgDecimals: 1,
        referenceUrl: "",
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    render(
      <CustomMetricsProvider initialMetrics={seed}>
        <MemoryRouter initialEntries={["/add-metric/health/c_x"]}>
          <Routes>
            <Route
              path="/add-metric/:type/:metricId"
              element={<CustomMetricForm />}
            />
            <Route
              path="/setup/tracking"
              element={<div>back to tracking setup</div>}
            />
          </Routes>
        </MemoryRouter>
      </CustomMetricsProvider>,
    );

    // Remap High from 5 to 3. A stored entry of `5` for this metric
    // would now be out of the new value set, reinterpreting (or
    // dropping) the data - exactly what the prompt protects against.
    const values = screen.getAllByLabelText(/^value/i);
    await user.clear(values[1]);
    await user.type(values[1], "3");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/level values/i);
    // Confirm returned false, so we should not have navigated.
    expect(screen.queryByText("back to tracking setup")).toBeNull();

    confirmSpy.mockRestore();
  });

  it("does NOT prompt when a level-row reorder leaves the value set unchanged", async () => {
    // Reordering [Low=1, High=5] to [High=5, Low=1] preserves the
    // multiset of stored values; entries keep their meaning. The
    // levels-changed check uses sorted values so position-only edits
    // don't trip the prompt.
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const seed: CustomMetricDef[] = [
      {
        id: "c_x",
        ownerId: "u1",
        name: "Mood",
        metricType: "health",
        primitive: "ordinal",
        inputType: "radio",
        levels: [
          { label: "Low", value: 1 },
          { label: "High", value: 5 },
        ],
        yTopRaw: 5,
        yBottomRaw: 1,
        avgDecimals: 1,
        referenceUrl: "",
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    render(
      <CustomMetricsProvider initialMetrics={seed}>
        <MemoryRouter initialEntries={["/add-metric/health/c_x"]}>
          <Routes>
            <Route
              path="/add-metric/:type/:metricId"
              element={<CustomMetricForm />}
            />
            <Route
              path="/setup/tracking"
              element={<div>back to tracking setup</div>}
            />
          </Routes>
        </MemoryRouter>
      </CustomMetricsProvider>,
    );

    // Swap row 0's label "Low"→"High" + value 1→5 and row 1's "High"→"Low" + 5→1.
    // After the swap the multiset of values is still {1, 5}.
    const labels = screen.getAllByLabelText(/^label/i);
    const values = screen.getAllByLabelText(/^value/i);
    await user.clear(labels[0]);
    await user.type(labels[0], "High");
    await user.clear(values[0]);
    await user.type(values[0], "5");
    await user.clear(labels[1]);
    await user.type(labels[1], "Low");
    await user.clear(values[1]);
    await user.type(values[1], "1");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe("CustomMetricForm (validation)", () => {
  // The Infinity / NaN branch of the !Number.isFinite check isn't
  // tested here because jsdom's type="number" input rejects exotic
  // values like "1e500" / "abc" before they reach the React state, so
  // typing them through the form is not a reliable harness. The
  // runtime fallback (customDefToChartConfig clamping) is unit-tested
  // alongside that helper instead.

  it("rejects decimals above 100 (toFixed RangeError boundary)", async () => {
    const user = userEvent.setup();
    renderAt("/add-metric/health/new");

    await user.type(screen.getByLabelText(/name/i), "Bad");
    await user.clear(screen.getByLabelText(/decimals/i));
    await user.type(screen.getByLabelText(/decimals/i), "1000");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(
      screen.getByText(/decimals must be an integer between 0 and 100/i),
    ).toBeInTheDocument();
  });

  it("rejects non-integer decimals", async () => {
    const user = userEvent.setup();
    renderAt("/add-metric/health/new");

    await user.type(screen.getByLabelText(/name/i), "Bad");
    await user.clear(screen.getByLabelText(/decimals/i));
    await user.type(screen.getByLabelText(/decimals/i), "1.5");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(
      screen.getByText(/decimals must be an integer between 0 and 100/i),
    ).toBeInTheDocument();
  });
});

describe("CustomMetricForm (canonical-route redirect)", () => {
  it("redirects a mismatched-type edit URL to the canonical type+id", () => {
    const seed: CustomMetricDef[] = [
      {
        id: "c_p",
        ownerId: "u1",
        name: "5K Time",
        metricType: "competition",
        primitive: "numeric",
        inputType: "numeric",
        unit: "min",
        goalRaw: 25,
        yTopRaw: 40,
        yBottomRaw: 15,
        avgDecimals: 1,
        referenceUrl: "",
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    render(
      <CustomMetricsProvider initialMetrics={seed}>
        <MemoryRouter initialEntries={["/add-metric/health/c_p"]}>
          <Routes>
            <Route
              path="/add-metric/:type/:metricId"
              element={<CustomMetricForm />}
            />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </CustomMetricsProvider>,
    );
    // Without the redirect, the form would render at the health URL
    // for a competition-typed metric — Cancel/Save/Delete would then
    // push the wrong navigation. The outer gate must rewrite the URL
    // to the metric's actual metricType.
    expect(screen.getByTestId("loc").textContent).toBe(
      "/add-metric/competition/c_p",
    );
  });
});

// Thin wrapper that renders the create form for a given metric type.
// Mirrors renderAt but with a more descriptive name for the new tests.
function renderCreateForm(type: "health" | "competition") {
  renderAt(`/add-metric/${type}/new`);
}

describe("CustomMetricForm — top-level type chooser", () => {
  it("renders three top-level buttons: Numeric, Categorical, Y/N", () => {
    renderCreateForm("health");
    expect(screen.getByRole("radio", { name: /numeric/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /categorical/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /y\/n/i })).toBeTruthy();
  });

  it("shows the levels editor for Categorical and Y/N but not Numeric", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    // Numeric (initial): no table.
    expect(screen.queryByRole("table")).toBeNull();
    // Categorical: editable table.
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("button", { name: /add row/i })).toBeTruthy();
    // Y/N: table visible but read-only (inputs disabled, no Add row).
    await user.click(screen.getByRole("radio", { name: /y\/n/i }));
    expect(screen.getByRole("table")).toBeTruthy();
    const labelInputs = screen.getAllByLabelText(/label/i) as HTMLInputElement[];
    expect(labelInputs.every((i) => i.disabled)).toBe(true);
    expect(screen.queryByRole("button", { name: /add row/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove row/i })).toBeNull();
  });

  it("preserves in-progress Categorical rows across a Y/N detour", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    // Type into the two seeded rows.
    const labels = screen.getAllByLabelText(/^label/i);
    const values = screen.getAllByLabelText(/^value/i);
    await user.type(labels[0], "Low");
    await user.type(values[0], "1");
    await user.type(labels[1], "High");
    await user.type(values[1], "9");
    // Detour through Y/N - the read-only table shows No/Yes here, but
    // the user's Categorical edits must survive untouched.
    await user.click(screen.getByRole("radio", { name: /y\/n/i }));
    expect((screen.getByLabelText(/^Label for row 1$/i) as HTMLInputElement).value).toBe("No");
    expect((screen.getByLabelText(/^Label for row 2$/i) as HTMLInputElement).value).toBe("Yes");
    // Back to Categorical - the user's rows are restored.
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    expect((screen.getByLabelText(/^Label for row 1$/i) as HTMLInputElement).value).toBe("Low");
    expect((screen.getByLabelText(/^Value for row 1$/i) as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText(/^Label for row 2$/i) as HTMLInputElement).value).toBe("High");
    expect((screen.getByLabelText(/^Value for row 2$/i) as HTMLInputElement).value).toBe("9");
  });


  it("greys out goal when Y/N is selected (per spec)", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.click(screen.getByRole("radio", { name: /y\/n/i }));
    const goal = screen.getByLabelText(/^goal$/i) as HTMLInputElement;
    expect(goal.disabled).toBe(true);
  });

  it("greys out decimals when Y/N is selected", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.click(screen.getByRole("radio", { name: /y\/n/i }));
    const decimals = screen.getByLabelText(/^decimals$/i) as HTMLInputElement;
    expect(decimals.disabled).toBe(true);
  });

  it("displays y-axis range as 0..1 when Y/N is selected", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.click(screen.getByRole("radio", { name: /y\/n/i }));
    expect((screen.getByLabelText(/y-axis top/i) as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText(/y-axis bottom/i) as HTMLInputElement).value).toBe("0");
  });

  it("displays y-axis range derived from levels as the user fills Categorical", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    // With both seeded rows blank, the derivation has nothing to chew
    // on - the disabled fields render empty so the user isn't told a
    // misleading range exists yet.
    expect((screen.getByLabelText(/y-axis top/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/y-axis bottom/i) as HTMLInputElement).value).toBe("");
    // Fill in the two seeded rows: values 2 and 7.
    const values = screen.getAllByLabelText(/^value/i);
    await user.type(values[0], "2");
    await user.type(values[1], "7");
    expect((screen.getByLabelText(/y-axis top/i) as HTMLInputElement).value).toBe("7");
    expect((screen.getByLabelText(/y-axis bottom/i) as HTMLInputElement).value).toBe("2");
  });

  it("greys out y-axis range when Categorical is selected", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    expect((screen.getByLabelText(/y-axis top/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/y-axis bottom/i) as HTMLInputElement).disabled).toBe(true);
  });
});

describe("CustomMetricForm — submit shape per top-level type", () => {
  it("writes primitive='numeric' with the full numeric config when Numeric is chosen", async () => {
    (mockedSetDoc as ReturnType<typeof vi.fn>).mockClear();
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.type(screen.getByLabelText(/^name$/i), "Steps");
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(mockedSetDoc).toHaveBeenCalled());
    const payload = (mockedSetDoc as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload.primitive).toBe("numeric");
    expect(payload.levels).toBeUndefined();
    expect(payload.unit).toBe("");
    expect(payload.goalRaw).toBe(0);
  });

  it("writes primitive='ordinal' and the Y/N levels when Y/N is chosen", async () => {
    (mockedSetDoc as ReturnType<typeof vi.fn>).mockClear();
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.type(screen.getByLabelText(/^name$/i), "Slept Well?");
    await user.click(screen.getByRole("radio", { name: /y\/n/i }));
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(mockedSetDoc).toHaveBeenCalled());
    const payload = (mockedSetDoc as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload.primitive).toBe("ordinal");
    expect(payload.inputType).toBe("radio");
    expect(payload.levels).toEqual([
      { label: "No", value: 0 },
      { label: "Yes", value: 1 },
    ]);
    expect(payload.yTopRaw).toBe(1);
    expect(payload.yBottomRaw).toBe(0);
    expect(payload.unit).toBeUndefined();
  });

  // Picking Categorical seeds two empty rows, so most of these tests
  // start from a 2-row baseline and either fill those rows or click
  // "Add row" to extend.
  it("derives yTop/yBottom from levels' min/max when Categorical is chosen", async () => {
    (mockedSetDoc as ReturnType<typeof vi.fn>).mockClear();
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.type(screen.getByLabelText(/^name$/i), "Mood");
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    // Two seeded rows + one Add row click → three rows, matching the
    // Low/Mid/High shape this test exercises.
    await user.click(screen.getByRole("button", { name: /add row/i }));
    const labels = screen.getAllByLabelText(/^label/i);
    const values = screen.getAllByLabelText(/^value/i);
    await user.type(labels[0], "Low");
    await user.type(values[0], "1");
    await user.type(labels[1], "Mid");
    await user.type(values[1], "3");
    await user.type(labels[2], "High");
    await user.type(values[2], "5");
    await user.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(mockedSetDoc).toHaveBeenCalled());
    const payload = (mockedSetDoc as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload.primitive).toBe("ordinal");
    expect(payload.levels).toEqual([
      { label: "Low", value: 1 },
      { label: "Mid", value: 3 },
      { label: "High", value: 5 },
    ]);
    expect(payload.yTopRaw).toBe(5);
    expect(payload.yBottomRaw).toBe(1);
  });

  it("rejects Categorical submit when any level is missing a value", async () => {
    (mockedSetDoc as ReturnType<typeof vi.fn>).mockClear();
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.type(screen.getByLabelText(/^name$/i), "Bad");
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    // Both seeded rows get labels so the label check passes, then
    // leave row 1's value blank so the value check fires.
    const labels = screen.getAllByLabelText(/^label/i);
    const values = screen.getAllByLabelText(/^value/i);
    await user.type(labels[0], "Solo");
    await user.type(values[0], "1");
    await user.type(labels[1], "Duo");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/each level needs a numeric value/i)).toBeTruthy();
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });

  it("rejects Categorical submit when fewer than 2 levels are defined", async () => {
    (mockedSetDoc as ReturnType<typeof vi.fn>).mockClear();
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.type(screen.getByLabelText(/^name$/i), "Tiny");
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    // Remove both seeded rows so the count check fires on submit.
    // findAllByRole because the buttons appear after a state change.
    const removeButtons = await screen.findAllByRole("button", {
      name: /remove row/i,
    });
    expect(removeButtons).toHaveLength(2);
    await user.click(removeButtons[0]);
    // After the first click, the array re-indexes - find the new
    // remove button rather than reusing the stale reference.
    const remaining = screen.getAllByRole("button", { name: /remove row/i });
    await user.click(remaining[0]);
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/at least two levels/i)).toBeTruthy();
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });

  it("rejects Categorical submit when level values are not unique", async () => {
    (mockedSetDoc as ReturnType<typeof vi.fn>).mockClear();
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.type(screen.getByLabelText(/^name$/i), "Dup");
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    // Two seeded rows are exactly right for the dup test.
    const labels = screen.getAllByLabelText(/^label/i);
    const values = screen.getAllByLabelText(/^value/i);
    await user.type(labels[0], "A");
    await user.type(values[0], "1");
    await user.type(labels[1], "B");
    await user.type(values[1], "1");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/level values must be unique/i)).toBeTruthy();
    expect(mockedSetDoc).not.toHaveBeenCalled();
  });
});

// Helper: renders the edit form for an existing metric seeded into the
// CustomMetricsContext via initialMetrics. Mirrors the pattern used in
// the "edit confirmation" describe block above.
function renderEditForm(type: "health" | "competition", def: CustomMetricDef) {
  render(
    <CustomMetricsProvider initialMetrics={[def]}>
      <MemoryRouter initialEntries={[`/add-metric/${type}/${def.id}`]}>
        <Routes>
          <Route
            path="/add-metric/:type/:metricId"
            element={<CustomMetricForm />}
          />
          <Route
            path="/setup/tracking"
            element={<div>back to tracking setup</div>}
          />
        </Routes>
      </MemoryRouter>
    </CustomMetricsProvider>,
  );
}

describe("CustomMetricForm — edit-mode inference", () => {
  it("opens with Numeric selected for an existing numeric metric", () => {
    renderEditForm("health", {
      id: "c_x",
      ownerId: "u1",
      name: "Steps",
      metricType: "health",
      primitive: "numeric",
      unit: "steps",
      goalRaw: 10000,
      yTopRaw: 20000,
      yBottomRaw: 0,
      avgDecimals: 0,
      inputType: "numeric",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    });
    expect((screen.getByRole("radio", { name: /numeric/i }) as HTMLInputElement).checked).toBe(true);
  });

  it("opens with Y/N selected for an ordinal metric with the canonical No/Yes levels", () => {
    renderEditForm("health", {
      id: "c_x",
      ownerId: "u1",
      name: "Slept Well?",
      metricType: "health",
      primitive: "ordinal",
      levels: [
        { label: "No", value: 0 },
        { label: "Yes", value: 1 },
      ],
      yTopRaw: 1,
      yBottomRaw: 0,
      avgDecimals: 1,
      inputType: "radio",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    });
    expect((screen.getByRole("radio", { name: /y\/n/i }) as HTMLInputElement).checked).toBe(true);
  });

  it("opens with Categorical selected for an ordinal metric with other levels", () => {
    renderEditForm("health", {
      id: "c_x",
      ownerId: "u1",
      name: "Mood",
      metricType: "health",
      primitive: "ordinal",
      levels: [
        { label: "Low", value: 1 },
        { label: "Mid", value: 3 },
        { label: "High", value: 5 },
      ],
      yTopRaw: 5,
      yBottomRaw: 1,
      avgDecimals: 1,
      inputType: "radio",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    });
    expect((screen.getByRole("radio", { name: /categorical/i }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("CustomMetricForm (built-in metric gateway)", () => {
  it("renders the override form for a built-in metric id", async () => {
    // leanMass is a built-in health metric — the gateway should route to
    // MetricOverrideForm, which shows a disabled Name field.
    renderAt("/add-metric/health/leanMass");
    const name = await screen.findByLabelText("Name");
    expect(name).toBeDisabled();
    expect((name as HTMLInputElement).value).toBe("Lean Mass");
  });
});

describe("CustomMetricForm (auto-track on create)", () => {
  it("appends the new metric id to trackedHealthMetrics on the first profile create", async () => {
    // userMock starts with loadState.status === "missing" (no profile
    // doc yet), so the auto-track flows through updateProfile rather
    // than setTrackedMetrics. Reset the mock so we see only this test's
    // call (other tests in this file also exercise the auto-track path).
    userMock.updateProfile.mockClear();

    const user = userEvent.setup();
    renderAt("/add-metric/health/new");

    await user.type(screen.getByLabelText(/name/i), "Stretch Time");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(userMock.updateProfile).toHaveBeenCalled();
    });
    const call = userMock.updateProfile.mock.calls.at(-1)?.[0] as
      | { trackedHealthMetrics?: string[] }
      | undefined;
    // Built-in defaults plus the freshly minted custom-metric id.
    expect(call?.trackedHealthMetrics).toEqual(
      expect.arrayContaining([expect.stringMatching(/^c_/)]),
    );
  });
});

describe("CustomMetricForm (performance)", () => {
  it("renders the form at /add-metric/performance/new instead of redirecting", () => {
    renderAt("/add-metric/performance/new");
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.queryByText(/back to tracking setup/i)).toBeNull();
  });

  it("saves a numeric perf metric and persists with metricType performance", async () => {
    const user = userEvent.setup();
    renderAt("/add-metric/performance/new");

    await user.type(screen.getByLabelText(/name/i), "Sprint Drill");
    await user.type(screen.getByLabelText(/unit/i), "sec");
    await user.clear(screen.getByLabelText(/goal/i));
    await user.type(screen.getByLabelText(/goal/i), "4.5");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText("back to tracking setup")).toBeInTheDocument();
    });
    expect(mockedSetDoc).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "Sprint Drill",
        metricType: "performance",
        unit: "sec",
        goalRaw: 4.5,
      }),
    );
  });

  it("auto-tracks the new perf metric id into trackedPerformanceMetrics on first profile create", async () => {
    userMock.updateProfile.mockClear();

    const user = userEvent.setup();
    renderAt("/add-metric/performance/new");

    await user.type(screen.getByLabelText(/name/i), "Sprint Drill");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(userMock.updateProfile).toHaveBeenCalled();
    });
    const call = userMock.updateProfile.mock.calls.at(-1)?.[0] as
      | { trackedPerformanceMetrics?: string[] }
      | undefined;
    expect(call?.trackedPerformanceMetrics).toEqual(
      expect.arrayContaining([expect.stringMatching(/^c_/)]),
    );
  });

  it("routes a built-in perf metric id (oneRepMaxBench) to MetricOverrideForm", () => {
    renderAt("/add-metric/performance/oneRepMaxBench");
    // MetricOverrideForm shows Name and Unit disabled. Unit reads the
    // MetricDefinition.unit ("kg or lbs"), not the chart CONFIG unit.
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByLabelText("Unit")).toBeDisabled();
    expect(
      (screen.getByLabelText("Unit") as HTMLInputElement).value,
    ).toBe("kg or lbs");
    // y-axis placeholders pull from the base CONFIG; expect the perf
    // bounds (0 and 250) rather than DEFAULT_CONFIG's 0/100.
    expect(
      (screen.getByLabelText(/^Y-axis top/) as HTMLInputElement).placeholder,
    ).toBe("250");
  });
});
