// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ProfileLoadState, UserProfile } from "../../types/profile";

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
  loadState: { status: "missing" } as ProfileLoadState,
  updateProfile: vi.fn(async () => {}),
  setTrackedMetrics: vi.fn(async () => {}),
}));
vi.mock("../../contexts/UserContext", () => ({
  useUser: () => userMock,
}));

import { CustomMetricsProvider } from "../../contexts/CustomMetricsContext";
import type { CustomMetricDef } from "../../types/customMetrics";
import { TrackedDataSetup } from "./TrackedDataSetup";
import tableCss from "./TrackedMetricsTable.module.css";
import commonCss from "../common.module.css";

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
    primitive: "numeric",
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

// A loaded-profile load state whose tracked-health list is exactly the
// given ids. Used to render a custom metric in the *tracked* state so
// its edit pencil shows (the pencil renders only for checked rows).
function loadedProfileTracking(trackedHealthMetrics: string[]): ProfileLoadState {
  return {
    status: "loaded",
    profile: {
      version: 1,
      fullName: "T",
      email: "t@e.com",
      nickname: "",
      age: 18,
      heightFt: 5,
      heightIn: 9,
      weight: 150,
      gender: "male",
      athleteType: "endurance",
      competitionTerm: "game",
      trackedHealthMetrics,
      trackedCompetitionMetrics: [],
      profileComplete: true,
      trackingSetupComplete: true,
    } as UserProfile,
  };
}

// A first-timer load state: profile is complete but tracking setup is
// not yet done, so the "Choose what to track" welcome block renders.
function loadedProfileFirstTimer(): ProfileLoadState {
  return {
    status: "loaded",
    profile: {
      version: 1,
      fullName: "T",
      email: "t@e.com",
      nickname: "",
      age: 18,
      heightFt: 5,
      heightIn: 9,
      weight: 150,
      gender: "male",
      athleteType: "endurance",
      competitionTerm: "game",
      trackedHealthMetrics: [],
      trackedCompetitionMetrics: [],
      profileComplete: true,
      trackingSetupComplete: false,
    } as UserProfile,
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
  afterEach(() => {
    // Reset the shared mock so a loaded-profile test doesn't leak into
    // the missing-profile tests that follow it.
    userMock.loadState = { status: "missing" };
  });

  it("renders the health CTA at /add-metric/health/new with the create-form label", () => {
    renderWith();
    const cta = screen.getByRole("link", {
      name: /add health metric/i,
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

  it("renders the performance CTA at /add-metric/performance/new as a live link", () => {
    renderWith();
    const cta = screen.getByRole("link", {
      name: /^add performance metric$/i,
    });
    expect(cta).toHaveAttribute("href", "/add-metric/performance/new");
    // Sanity: the 🚧 emoji and 'coming soon' affordance are gone.
    expect(cta.textContent).not.toMatch(/🚧/);
  });

  it("does not render a disabled 'coming soon' performance button", () => {
    renderWith();
    expect(
      screen.queryByRole("button", { name: /add performance metric/i }),
    ).toBeNull();
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

  it("gives tracked custom rows an edit-pencil link to the create/edit form", () => {
    // The custom metric must be tracked (checked) for its edit pencil
    // to render — the pencil is gated on the row being checked.
    userMock.loadState = loadedProfileTracking(["c_w"]);
    renderWith([customDef("c_w", "Stretch Time", "health")]);
    const editLink = screen.getByRole("link", { name: /edit stretch time/i });
    expect(editLink).toHaveAttribute("href", "/add-metric/health/c_w");
  });

  it("does not give an untracked custom row an edit-pencil link", () => {
    // Missing profile -> only built-in defaults are tracked, so the
    // seeded custom metric is untracked and gets no edit pencil.
    renderWith([customDef("c_w", "Stretch Time", "health")]);
    expect(
      screen.queryByRole("link", { name: /edit stretch time/i }),
    ).toBeNull();
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

describe("TrackedDataSetup — first heading top margin", () => {
  afterEach(() => {
    userMock.loadState = { status: "missing" };
  });

  it("tightens the first heading's top margin for a return user (no welcome block)", () => {
    userMock.loadState = loadedProfileTracking([]); // trackingSetupComplete: true
    renderWith();
    expect(screen.queryByText(/choose what to track/i)).toBeNull();
    const heading = screen.getByRole("heading", { name: /health log/i });
    expect(heading).toHaveClass(tableCss.tightTop);
  });

  it("keeps the first heading's top margin for a first-timer (welcome block shown)", () => {
    userMock.loadState = loadedProfileFirstTimer(); // trackingSetupComplete: false
    renderWith();
    expect(screen.getByText(/choose what to track/i)).toBeInTheDocument();
    const heading = screen.getByRole("heading", { name: /health log/i });
    expect(heading).not.toHaveClass(tableCss.tightTop);
  });
});

describe("TrackedDataSetup — reorder hint", () => {
  // The visible "Drag the handle to reorder…" prompt is removed per the
  // design, but the instructions stay in the DOM screen-reader-only so
  // each drag handle's aria-describedby still announces the keyboard
  // shortcut to AT/keyboard users.
  it("renders the reorder hint screen-reader-only, not as a visible prompt", () => {
    renderWith();
    const hints = screen.getAllByText(/drag the handle to reorder/i);
    expect(hints.length).toBeGreaterThan(0);
    hints.forEach((hint) =>
      expect(hint).toHaveClass(commonCss.visuallyHidden),
    );
  });
});
