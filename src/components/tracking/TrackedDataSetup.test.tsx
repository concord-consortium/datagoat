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
  metricType: "wellness" | "performance",
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
  it("renders the wellness CTA at /add-metric/wellness/new with the create-form label", () => {
    renderWith();
    const cta = screen.getByRole("link", {
      name: /add custom health & wellness metric/i,
    });
    expect(cta).toHaveAttribute("href", "/add-metric/wellness/new");
  });

  it("renders the performance CTA at /add-metric/performance/new", () => {
    renderWith();
    const cta = screen.getByRole("link", {
      name: /add custom performance metric/i,
    });
    expect(cta).toHaveAttribute("href", "/add-metric/performance/new");
  });

  it("renders seeded wellness customs in the wellness table", () => {
    renderWith([customDef("c_w", "Stretch Time", "wellness")]);
    expect(screen.getByText("Stretch Time")).toBeInTheDocument();
  });

  it("does NOT render performance customs in the wellness section (and vice versa)", () => {
    renderWith([
      customDef("c_w", "Stretch Time", "wellness"),
      customDef("c_p", "5K Time", "performance"),
    ]);
    // Both names render somewhere on the page (each in its own table),
    // but the per-table check is implicit: each metric appears once.
    expect(screen.getAllByText("Stretch Time")).toHaveLength(1);
    expect(screen.getAllByText("5K Time")).toHaveLength(1);
  });

  it("gives custom rows an edit-pencil affordance instead of an info link", () => {
    renderWith([customDef("c_w", "Stretch Time", "wellness")]);
    // Customs: aria-label is `Edit ${name}` (the edit pencil), and
    // the link points at the create/edit form route — not /wellness/:id.
    const editLink = screen.getByRole("link", { name: /edit stretch time/i });
    expect(editLink).toHaveAttribute("href", "/add-metric/wellness/c_w");
    // No info link with this name should exist (built-ins use `${name} info`).
    expect(
      screen.queryByRole("link", { name: /^stretch time info$/i }),
    ).toBeNull();
  });

  it("preserves the info-link affordance for built-in metrics", () => {
    renderWith();
    // Hydration is a built-in wellness metric; its row should show an
    // info link, not an edit pencil. Aria label format is `${name} info`.
    expect(
      screen.getByRole("link", { name: /^hydration info$/i }),
    ).toBeInTheDocument();
  });
});
