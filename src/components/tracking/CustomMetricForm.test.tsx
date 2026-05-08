// @vitest-environment jsdom
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  CustomMetricsProvider,
  useCustomMetrics,
} from "../../contexts/CustomMetricsContext";
import type { CustomMetricDef } from "../../types/customMetrics";
import { CustomMetricForm } from "./CustomMetricForm";

// Probe component that mirrors the latest metrics list into a captured
// array for test assertions. Uses useEffect to avoid render-phase side
// effects.
function CaptureMetrics({ into }: { into: { current: CustomMetricDef[] } }) {
  const { metrics } = useCustomMetrics();
  useEffect(() => {
    into.current = metrics;
  }, [metrics, into]);
  return null;
}

function renderAt(path: string, into?: { current: CustomMetricDef[] }) {
  return render(
    <CustomMetricsProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/add-metric/:type/new" element={<CustomMetricForm />} />
          <Route path="/add-metric/:type/:metricId" element={<CustomMetricForm />} />
          <Route path="/add-metric/:type" element={<div>back to list</div>} />
        </Routes>
      </MemoryRouter>
      {into && <CaptureMetrics into={into} />}
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
    const captured: { current: CustomMetricDef[] } = { current: [] };
    renderAt("/add-metric/wellness/new", captured);

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
    expect(captured.current).toHaveLength(1);
    expect(captured.current[0].name).toBe("Stretch Minutes");
    expect(captured.current[0].metricType).toBe("wellness");
    expect(captured.current[0].unit).toBe("min");
    expect(captured.current[0].goalRaw).toBe(15);
  });
});
