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
  updateProfile: vi.fn(async () => {}),
  setTrackedMetrics: vi.fn(async () => {}),
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
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setDoc as mockedSetDoc } from "firebase/firestore";
import { CustomMetricsProvider } from "../../contexts/CustomMetricsContext";
import type { CustomMetricDef } from "../../types/customMetrics";
import { CustomMetricForm } from "./CustomMetricForm";

function renderAt(path: string) {
  return render(
    <CustomMetricsProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/add-metric/:type/new" element={<CustomMetricForm />} />
          <Route path="/add-metric/:type/:metricId" element={<CustomMetricForm />} />
          <Route path="/add-metric/:type" element={<div>back to list</div>} />
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
      expect(screen.getByText("back to list")).toBeInTheDocument();
    });
    expect(mockedSetDoc).toHaveBeenCalledTimes(1);
    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "Stretch Minutes",
        metricType: "wellness",
        unit: "min",
        goalRaw: 15,
      }),
    );
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
            <Route path="/add-metric/:type" element={<div>back to list</div>} />
          </Routes>
        </MemoryRouter>
      </CustomMetricsProvider>,
    );

    await user.clear(screen.getByLabelText(/unit/i));
    await user.type(screen.getByLabelText(/unit/i), "minutes");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/unit/i);
    expect(screen.queryByText("back to list")).toBeNull();

    confirmSpy.mockRestore();
  });
});
