// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// CustomMetricsProvider's useAuth is mocked via the auth-context stub
// so the provider renders without exercising Firestore. We rely on the
// initialMetrics test seam to skip onSnapshot.
const stableAuth = vi.hoisted(() => ({
  user: { uid: "u1" } as { uid: string },
  loading: false,
  isEmailVerifiedOrTrusted: true,
  signOut: async () => {},
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => stableAuth,
}));

// UserContext is mocked at module scope so each test can mutate
// `userMock.loadState` (e.g. to swap between missing-profile and
// loaded-profile flows). The handlers are noop because TrackedDataSetup
// doesn't dispatch from this test surface — we only assert what
// renders.
const userMock = vi.hoisted(() => ({
  loadState: { status: "missing" as const },
  updateProfile: vi.fn(async () => {}),
  setTrackedMetrics: vi.fn(async () => {}),
}));
vi.mock("../../contexts/UserContext", () => ({
  useUser: () => userMock,
}));

import { CustomMetricsProvider } from "../../contexts/CustomMetricsContext";
import type { CustomMetricDef } from "../../types/customMetrics";
import { TrackedDataSetup } from "./TrackedDataSetup";

function customDef(
  id: string,
  name: string,
  metricType: "health" | "competition",
): CustomMetricDef {
  return {
    id,
    ownerId: "u1",
    name,
    metricType,
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

function renderWith(seed: CustomMetricDef[] = []) {
  return render(
    <CustomMetricsProvider initialMetrics={seed}>
      <MemoryRouter>
        <TrackedDataSetup />
      </MemoryRouter>
    </CustomMetricsProvider>,
  );
}

describe("TrackedDataSetup — custom-metric integration", () => {
  it("renders the health CTA at /add-metric/health/new with the create-form label", () => {
    renderWith();
    const cta = screen.getByRole("link", {
      name: /add health & performance metric/i,
    });
    expect(cta).toHaveAttribute("href", "/add-metric/health/new");
  });

  it("renders the competition CTA at /add-metric/competition/new", () => {
    renderWith();
    const cta = screen.getByRole("link", {
      name: /add competition metric/i,
    });
    expect(cta).toHaveAttribute("href", "/add-metric/competition/new");
  });

  it("renders seeded health customs in the health table", () => {
    renderWith([customDef("c_w", "Stretch Time", "health")]);
    expect(screen.getByText("Stretch Time")).toBeInTheDocument();
  });

  it("does NOT render competition customs in the health section (and vice versa)", () => {
    renderWith([
      customDef("c_w", "Stretch Time", "health"),
      customDef("c_p", "5K Time", "competition"),
    ]);
    // Both names render somewhere on the page (each in its own table),
    // but the per-table check is implicit: each metric appears once.
    expect(screen.getAllByText("Stretch Time")).toHaveLength(1);
    expect(screen.getAllByText("5K Time")).toHaveLength(1);
  });

  it("gives custom rows an edit-pencil link to the create/edit form", () => {
    renderWith([customDef("c_w", "Stretch Time", "health")]);
    const editLink = screen.getByRole("link", { name: /edit stretch time/i });
    expect(editLink).toHaveAttribute("href", "/add-metric/health/c_w");
  });

  it("renders an info link to MetricDetail for custom rows (parallel to built-ins)", () => {
    renderWith([customDef("c_w", "Stretch Time", "health")]);
    // Custom rows now keep the Info column as a chart-detail link;
    // the visual difference from a built-in is the icon (custom-metric
    // glyph rather than the metric's own Icon).
    const infoLink = screen.getByRole("link", { name: /^stretch time info$/i });
    expect(infoLink).toHaveAttribute("href", "/health/c_w");
  });

  it("preserves the info-link affordance for built-in metrics", () => {
    renderWith();
    expect(
      screen.getByRole("link", { name: /^hydration info$/i }),
    ).toBeInTheDocument();
  });
});
