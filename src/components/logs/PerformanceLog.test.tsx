// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
  type Location,
} from "react-router-dom";

import type { ProfileLoadState, UserProfile } from "../../types/profile";
import type { DataLoadState, PerformanceEntry } from "../../types/data";
import type { CustomMetricDef } from "../../types/customMetrics";

const PROFILE: UserProfile = {
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
  // Empty-state branch is the default-on case (PERFORMANCE_METRICS is
  // empty per DGT-51), so per-test overrides drive the input/custom
  // coverage below.
  profileComplete: true,
  trackingSetupComplete: true,
};

const ctx = vi.hoisted(() => ({
  user: { uid: "u1" } as { uid: string } | null,
  loadState: { status: "loaded" } as ProfileLoadState,
  performance: {
    status: "loaded",
    entries: [],
  } as DataLoadState<PerformanceEntry>,
  setPerformanceEntryMock: vi.fn() as (...args: unknown[]) => void,
  customMetrics: [] as CustomMetricDef[],
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: ctx.user }),
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ loadState: ctx.loadState }),
}));

vi.mock("../../contexts/DataContext", () => ({
  useData: () => ({
    performance: ctx.performance,
    setPerformanceEntry: ctx.setPerformanceEntryMock,
  }),
}));

vi.mock("../../contexts/CustomMetricsContext", () => ({
  useCustomMetrics: () => ({
    metrics: ctx.customMetrics,
    loading: false,
    addMetric: vi.fn(),
    updateMetric: vi.fn(),
    deleteMetric: vi.fn(),
    getMetric: (id: string) =>
      ctx.customMetrics.find((m) => m.id === id),
  }),
}));

vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("../../utils/logError", () => ({ logError: vi.fn() }));

import { PerformanceLog } from "./PerformanceLog";
import { dateAtOffset, HISTORY, toISO } from "../../utils/dates";

const TODAY_ISO = toISO(dateAtOffset(HISTORY));

function inputForMetric(label: string): HTMLInputElement {
  return screen.getByRole("textbox", { name: label }) as HTMLInputElement;
}

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/performance" element={<PerformanceLog />} />
      </Routes>
    </MemoryRouter>,
  );
}

let capturedLocation: Location | null = null;
function LocationCapture() {
  capturedLocation = useLocation();
  return null;
}

function renderAtWithLocation(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/performance"
          element={
            <>
              <PerformanceLog />
              <LocationCapture />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ctx.user = { uid: "u1" };
  ctx.loadState = { status: "loaded", profile: PROFILE };
  ctx.performance = { status: "loaded", entries: [] };
  ctx.customMetrics = [];
  capturedLocation = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PerformanceLog route + redirect", () => {
  it("malformed ?date= falls back to /performance", () => {
    ctx.loadState = {
      status: "loaded",
      profile: { ...PROFILE, trackedPerformanceMetrics: ["oneRepMaxBench"] },
    };
    renderAtWithLocation("/performance?date=NOT-A-DATE");
    expect(capturedLocation?.pathname).toBe("/performance");
    expect(capturedLocation?.search).toBe("");
  });

  it("?date= outside [0, HISTORY] falls back to /performance", () => {
    ctx.loadState = {
      status: "loaded",
      profile: { ...PROFILE, trackedPerformanceMetrics: ["oneRepMaxBench"] },
    };
    renderAtWithLocation("/performance?date=2099-01-01");
    expect(capturedLocation?.pathname).toBe("/performance");
    expect(capturedLocation?.search).toBe("");
  });
});

describe("PerformanceLog empty state", () => {
  it("shows the Add CTA when no performance metrics are tracked", () => {
    // PROFILE omits trackedPerformanceMetrics; PERFORMANCE_METRICS
    // (the default-on registry) is empty per the DGT-51 sheet, so the
    // fallback list is also empty and the empty-state branch renders.
    renderAt("/performance");
    expect(document.querySelectorAll("table").length).toBe(0);
    expect(screen.getByText(/no performance metrics tracked/i)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /add a performance metric/i }),
    ).toBeTruthy();
  });
});

describe("PerformanceLog metric resolution", () => {
  it("renders a built-in metric resolved through ADDABLE_PERFORMANCE", () => {
    ctx.loadState = {
      status: "loaded",
      profile: {
        ...PROFILE,
        trackedPerformanceMetrics: ["oneRepMaxBench"],
      },
    };
    renderAt("/performance");
    expect(
      screen.getByRole("link", { name: /1 rep max bench press/i }),
    ).toBeTruthy();
  });

  it("renders a custom performance metric alongside built-ins", () => {
    const customDef: CustomMetricDef = {
      id: "p_custom00001",
      ownerId: "u1",
      name: "Vertical jump (in)",
      metricType: "performance",
      primitive: "numeric",
      inputType: "numeric",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    };
    ctx.customMetrics = [customDef];
    ctx.loadState = {
      status: "loaded",
      profile: {
        ...PROFILE,
        trackedPerformanceMetrics: ["oneRepMaxBench", customDef.id],
      },
    };
    renderAt("/performance");
    expect(
      screen.getByRole("link", { name: /1 rep max bench press/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /vertical jump/i }),
    ).toBeTruthy();
  });

  it("silently drops tracked ids that resolve to neither a built-in nor a performance custom", () => {
    // A health custom in customMetrics must not surface in the
    // Performance log even if its id sneaks into the tracked list -
    // mirrors CompetitionLog's metricType-filtered resolution.
    const healthDef: CustomMetricDef = {
      id: "h_strayhealthx",
      ownerId: "u1",
      name: "Health stray",
      metricType: "health",
      primitive: "numeric",
      inputType: "numeric",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    };
    ctx.customMetrics = [healthDef];
    ctx.loadState = {
      status: "loaded",
      profile: {
        ...PROFILE,
        trackedPerformanceMetrics: ["oneRepMaxBench", healthDef.id, "nonsense"],
      },
    };
    renderAt("/performance");
    expect(screen.queryByText(/health stray/i)).toBeNull();
    expect(
      screen.getByRole("link", { name: /1 rep max bench press/i }),
    ).toBeTruthy();
  });

  it("renders an ordinal performance custom metric as a radio group", () => {
    const ordinalDef: CustomMetricDef = {
      id: "p_ordinal0001",
      ownerId: "u1",
      name: "Effort level",
      metricType: "performance",
      primitive: "ordinal",
      inputType: "radio",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
      levels: [
        { label: "Low", value: 1 },
        { label: "High", value: 5 },
      ],
    };
    ctx.customMetrics = [ordinalDef];
    ctx.loadState = {
      status: "loaded",
      profile: {
        ...PROFILE,
        trackedPerformanceMetrics: [ordinalDef.id],
      },
    };
    renderAt("/performance");
    expect(screen.getByRole("radio", { name: /^low$/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^high$/i })).toBeTruthy();
  });
});

describe("PerformanceLog time metrics", () => {
  it("renders 'oneMileRun' as a multi-field time input", () => {
    ctx.loadState = {
      status: "loaded",
      profile: {
        ...PROFILE,
        trackedPerformanceMetrics: ["oneMileRun"],
      },
    };
    renderAt("/performance");
    const row = Array.from(document.querySelectorAll("tr")).find((r) =>
      r.textContent?.includes("1-Mile Run"),
    );
    expect(row).toBeDefined();
    expect(row!.querySelectorAll("input").length).toBeGreaterThanOrEqual(2);
  });

  it("renders 'tenMeterSprint' as a single seconds input", () => {
    ctx.loadState = {
      status: "loaded",
      profile: {
        ...PROFILE,
        trackedPerformanceMetrics: ["tenMeterSprint"],
      },
    };
    renderAt("/performance");
    const row = Array.from(document.querySelectorAll("tr")).find((r) =>
      r.textContent?.includes("10-Meter Sprint"),
    );
    expect(row).toBeDefined();
    expect(row!.querySelectorAll("input").length).toBe(1);
  });
});

describe("PerformanceLog Latest column for time metrics", () => {
  it("shows a formatted time (not the raw decimal) in the Latest cell for 'oneMileRun'", () => {
    // Regression: the Latest cell used to render String(live) even for
    // time metrics, so a stored 4.5 (4m30s) showed "4.5" instead of "4:30".
    ctx.loadState = {
      status: "loaded",
      profile: {
        ...PROFILE,
        trackedPerformanceMetrics: ["oneMileRun"],
      },
    };
    ctx.performance = {
      status: "loaded",
      entries: [
        {
          version: 1,
          date: TODAY_ISO,
          metrics: { oneMileRun: 4.5 },
        },
      ],
    };
    renderAt("/performance");
    const row = Array.from(document.querySelectorAll("tr")).find((r) =>
      r.textContent?.includes("1-Mile Run"),
    );
    expect(row).toBeDefined();
    const latestCell = row!.querySelector("td");
    expect(latestCell?.textContent).toBe("4:30");
  });
});

describe("PerformanceLog writes", () => {
  it("typing into a numeric metric calls setPerformanceEntry per keystroke", () => {
    ctx.loadState = {
      status: "loaded",
      profile: {
        ...PROFILE,
        trackedPerformanceMetrics: ["oneRepMaxBench"],
      },
    };
    renderAt("/performance");
    fireEvent.change(inputForMetric("1 Rep Max Bench Press"), {
      target: { value: "225" },
    });
    expect(ctx.setPerformanceEntryMock).toHaveBeenCalledWith(TODAY_ISO, {
      metrics: { oneRepMaxBench: 225 },
    });
  });

  it("clearing a numeric metric writes `undefined` so the field is deleted", () => {
    ctx.loadState = {
      status: "loaded",
      profile: {
        ...PROFILE,
        trackedPerformanceMetrics: ["oneRepMaxBench"],
      },
    };
    ctx.performance = {
      status: "loaded",
      entries: [
        {
          version: 1,
          date: TODAY_ISO,
          metrics: { oneRepMaxBench: 225 },
        },
      ],
    };
    renderAt("/performance");
    fireEvent.change(inputForMetric("1 Rep Max Bench Press"), {
      target: { value: "" },
    });
    expect(ctx.setPerformanceEntryMock).toHaveBeenCalledWith(TODAY_ISO, {
      metrics: { oneRepMaxBench: undefined },
    });
  });
});
