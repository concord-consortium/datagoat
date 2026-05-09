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
    (type: "wellness" | "performance", ids: string[]) => Promise<void>
  >(async () => {}),
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => userMock,
}));

vi.mock("../../contexts/DataContext", async () => {
  // Import inside the async factory so we get the real
  // emptyWellnessEntry — vi.mock factories are hoisted above static
  // imports, so we cannot reach top-level imports from here.
  const { emptyWellnessEntry } = await import("../../types/data");
  return {
    useData: () => ({
      wellness: {
        status: "loaded",
        entries: [
          {
            ...emptyWellnessEntry("2026-05-01"),
            customMetrics: { c_x: 30 },
          },
        ],
      },
      performance: { status: "loaded", entries: [] },
      setWellnessEntry: vi.fn(),
      setPerformanceEntry: vi.fn(),
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
    renderAt("/add-metric/wellness/new");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });

  it("saves a numeric metric on submit and navigates back", async () => {
    const user = userEvent.setup();
    renderAt("/add-metric/wellness/new");

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
        metricType: "wellness",
        unit: "min",
        goalRaw: 15,
        referenceUrl: "",
      }),
    );
  });

  it("persists a valid Reference URL when provided", async () => {
    const user = userEvent.setup();
    renderAt("/add-metric/wellness/new");

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
    renderAt("/add-metric/wellness/new");

    await user.type(screen.getByLabelText(/name/i), "Stretch Minutes");
    await user.type(
      screen.getByLabelText(/reference url/i),
      "not a url",
    );
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(
      screen.getByText(/reference url must be a valid url/i),
    ).toBeInTheDocument();
    // The form must NOT navigate away when validation fails.
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
        metricType: "wellness",
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
        <MemoryRouter initialEntries={["/add-metric/wellness/c_x"]}>
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
    renderAt("/add-metric/wellness/new");

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
    renderAt("/add-metric/wellness/new");

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
        metricType: "performance",
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
        <MemoryRouter initialEntries={["/add-metric/wellness/c_p"]}>
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
    // Without the redirect, the form would render at the wellness URL
    // for a performance-typed metric — Cancel/Save/Delete would then
    // push the wrong navigation. The outer gate must rewrite the URL
    // to the metric's actual metricType.
    expect(screen.getByTestId("loc").textContent).toBe(
      "/add-metric/performance/c_p",
    );
  });
});

describe("CustomMetricForm (auto-track on create)", () => {
  it("appends the new metric id to trackedWellnessMetrics on the first profile create", async () => {
    // userMock starts with loadState.status === "missing" (no profile
    // doc yet), so the auto-track flows through updateProfile rather
    // than setTrackedMetrics. Reset the mock so we see only this test's
    // call (other tests in this file also exercise the auto-track path).
    userMock.updateProfile.mockClear();

    const user = userEvent.setup();
    renderAt("/add-metric/wellness/new");

    await user.type(screen.getByLabelText(/name/i), "Stretch Time");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(userMock.updateProfile).toHaveBeenCalled();
    });
    const call = userMock.updateProfile.mock.calls.at(-1)?.[0] as
      | { trackedWellnessMetrics?: string[] }
      | undefined;
    // Built-in defaults plus the freshly minted custom-metric id.
    expect(call?.trackedWellnessMetrics).toEqual(
      expect.arrayContaining([expect.stringMatching(/^c_/)]),
    );
  });
});
