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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setDoc as mockedSetDoc } from "firebase/firestore";
import { CustomMetricsProvider } from "../../contexts/CustomMetricsContext";
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
    const written = (mockedSetDoc as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as Record<string, unknown>;
    expect(written.name).toBe("Stretch Minutes");
    expect(written.metricType).toBe("wellness");
    expect(written.unit).toBe("min");
    expect(written.goalRaw).toBe(15);
  });
});
