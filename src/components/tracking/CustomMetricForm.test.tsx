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
    (type: "health" | "competition", ids: string[]) => Promise<void>
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
    <CustomMetricsProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/add-metric/:type/new" element={<CustomMetricForm />} />
          <Route path="/add-metric/:type/:metricId" element={<CustomMetricForm />} />
          <Route path="/setup/tracking" element={<div>back to tracking setup</div>} />
        </Routes>
      </MemoryRouter>
    </CustomMetricsProvider>,
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

  it("shows the levels editor only when Categorical is selected", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    expect(screen.getByRole("table")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /y\/n/i }));
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("greys out goal when Y/N is selected (per spec)", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.click(screen.getByRole("radio", { name: /y\/n/i }));
    const goal = screen.getByLabelText(/^goal$/i) as HTMLInputElement;
    expect(goal.disabled).toBe(true);
  });

  it("greys out y-axis range when Categorical is selected", async () => {
    const user = userEvent.setup();
    renderCreateForm("health");
    await user.click(screen.getByRole("radio", { name: /categorical/i }));
    expect((screen.getByLabelText(/y-axis top/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/y-axis bottom/i) as HTMLInputElement).disabled).toBe(true);
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
