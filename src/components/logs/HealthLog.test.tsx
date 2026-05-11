// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import type { ProfileLoadState, UserProfile } from "../../types/profile";
import type { DataLoadState, HealthEntry } from "../../types/data";
import type { CustomMetricDef } from "../../types/customMetrics";
import {
  firestoreMockFactory,
  latestSub,
  resetFirestoreState,
  type FirestoreMockState,
} from "../../test/firestoreMocks";

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
  trackedHealthMetrics: [
    "hydration",
    "sleepTime",
    "sleepEfficiency",
    "protein",
    "leanMass",
    "availability",
  ],
  trackedCompetitionMetrics: [],
  profileComplete: true,
  trackingSetupComplete: true,
};

// =============================================================
// Lightweight context mock used by route/redirect tests. These
// tests don't depend on the optimistic-merge contract, so the
// existing pattern of mocking DataContext directly stays - it
// keeps Firestore plumbing out of tests that don't need it.
// =============================================================
const ctx = vi.hoisted(() => ({
  user: { uid: "u1" } as { uid: string } | null,
  loadState: { status: "loaded" } as ProfileLoadState,
  health: { status: "loaded", entries: [] } as DataLoadState<HealthEntry>,
  setHealthEntryMock: vi.fn() as (...args: unknown[]) => void,
  customMetrics: [] as CustomMetricDef[],
  useLightweightMocks: true,
}));

// Hoisted state for the real-provider tests. Same fixture as
// DataContext.test.tsx.
const state = vi.hoisted<FirestoreMockState>(() => ({
  setDoc: vi.fn(async () => undefined),
  healthSubs: [],
  competitionSubs: [],
  user: { current: null },
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => {
    if (ctx.useLightweightMocks) return { user: ctx.user };
    return { user: state.user.current };
  },
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ loadState: ctx.loadState }),
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

// Pull in the real module so DataProvider is always exported. Override
// useData when useLightweightMocks is true; otherwise defer to the
// real implementation.
vi.mock("../../contexts/DataContext", async () => {
  const actual = await vi.importActual<
    typeof import("../../contexts/DataContext")
  >("../../contexts/DataContext");
  return {
    ...actual,
    useData: () => {
      if (ctx.useLightweightMocks) {
        return {
          health: ctx.health,
          setHealthEntry: ctx.setHealthEntryMock,
        } as unknown as ReturnType<typeof actual.useData>;
      }
      return actual.useData();
    },
  };
});

vi.mock("firebase/firestore", () => firestoreMockFactory(state));
vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("../../utils/logError", () => ({ logError: vi.fn() }));

import { HealthLog } from "./HealthLog";
import { DataProvider } from "../../contexts/DataContext";
import { dateAtOffset, HISTORY, toISO } from "../../utils/dates";

const TODAY_ISO = toISO(dateAtOffset(HISTORY));

function inputForMetric(label: string): HTMLInputElement {
  return screen.getByRole("textbox", { name: label }) as HTMLInputElement;
}

function setSleepTime(value: string) {
  fireEvent.change(inputForMetric("Total Sleep Time"), { target: { value } });
}

function setProtein(value: string) {
  fireEvent.change(inputForMetric("Protein Intake"), { target: { value } });
}

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/health" element={<HealthLog />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderWithProvider(initialPath: string) {
  return render(
    <DataProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/health" element={<HealthLog />} />
        </Routes>
      </MemoryRouter>
    </DataProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ctx.useLightweightMocks = true;
  ctx.user = { uid: "u1" };
  ctx.loadState = { status: "loaded", profile: PROFILE };
  ctx.health = { status: "loaded", entries: [] };
  ctx.customMetrics = [];
  resetFirestoreState(state);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HealthLog route + redirect", () => {
  it("malformed ?date= falls back to /health", () => {
    render(
      <MemoryRouter initialEntries={["/health?date=NOT-A-DATE"]}>
        <Routes>
          <Route path="/health" element={<HealthLog />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(document.querySelectorAll("table").length).toBeGreaterThan(0);
  });

  it("?date= outside [0, HISTORY] falls back to /health", () => {
    render(
      <MemoryRouter initialEntries={["/health?date=2099-01-01"]}>
        <Routes>
          <Route path="/health" element={<HealthLog />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(document.querySelectorAll("table").length).toBeGreaterThan(0);
  });

  it("typing into a numeric metric calls setHealthEntry per keystroke", () => {
    renderAt("/health");
    setSleepTime("8");
    expect(ctx.setHealthEntryMock).toHaveBeenCalledWith(
      TODAY_ISO,
      expect.objectContaining({ sleepTime: 8 }),
    );
    setProtein("1.5");
    expect(ctx.setHealthEntryMock).toHaveBeenCalledWith(
      TODAY_ISO,
      expect.objectContaining({ protein: 1.5 }),
    );
    // The component no longer debounces; debounce lives in DataContext.
    expect(ctx.setHealthEntryMock).toHaveBeenCalledTimes(2);
  });
});

describe("HealthLog custom-metric row", () => {
  it("renders the custom metric name as a link to /health/:customId", () => {
    // Regression: the custom row was rendering name as plain text
    // because the <MetricInputRow> call site omitted detailHref. Match
    // the built-in branch and CompetitionLog parity by linking to the
    // metric-detail route.
    const customDef: CustomMetricDef = {
      id: "c_abc1234567",
      ownerId: "u1",
      name: "Caffeine Intake",
      metricType: "health",
      inputType: "numeric",
      unit: "mg",
      goalRaw: 200,
      yTopRaw: 400,
      yBottomRaw: 0,
      avgDecimals: 0,
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    };
    ctx.customMetrics = [customDef];
    ctx.loadState = {
      status: "loaded",
      profile: { ...PROFILE, trackedHealthMetrics: [customDef.id] },
    };
    renderAt("/health");
    const link = screen.getByRole("link", { name: "Caffeine Intake" });
    expect(link).toHaveAttribute("href", "/health/c_abc1234567");
  });
});

describe("HealthLog chip reactivity to tracked-metric changes", () => {
  it("chip recomputes when trackedHealthMetrics changes via UserContext", () => {
    // Tracking only hydration, with hydration filled in the entry -> "all".
    ctx.loadState = {
      status: "loaded",
      profile: { ...PROFILE, trackedHealthMetrics: ["hydration"] },
    };
    ctx.health = {
      status: "loaded",
      entries: [
        {
          version: 1,
          date: TODAY_ISO,
          hydration: 3,
          sleepTime: 0,
          sleepEfficiency: 0,
          protein: 0,
          leanMass: 0,
          availability: {
            practiceHeld: null,
            practiceParticipation: null,
            gameHeld: null,
            gameParticipation: null,
          },
        },
      ],
    };
    const { rerender } = renderAt("/health");
    expect(
      document
        .querySelector("[data-chip-state]")
        ?.getAttribute("data-chip-state"),
    ).toBe("all");

    // User adds sleepTime via TrackedDataSetup; the profile snapshot reloads
    // through UserContext. The chip must flip to "some" without a remount.
    ctx.loadState = {
      status: "loaded",
      profile: {
        ...PROFILE,
        trackedHealthMetrics: ["hydration", "sleepTime"],
      },
    };
    rerender(
      <MemoryRouter initialEntries={["/health"]}>
        <Routes>
          <Route path="/health" element={<HealthLog />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      document
        .querySelector("[data-chip-state]")
        ?.getAttribute("data-chip-state"),
    ).toBe("some");
  });
});

describe("HealthLog optimistic state via real DataContext", () => {
  beforeEach(() => {
    ctx.useLightweightMocks = false;
    state.user.current = { uid: "u1" };
  });

  it("chip updates per keystroke (no 500ms lag)", async () => {
    vi.useFakeTimers();
    renderWithProvider("/health");
    // Drive the initial health snapshot to "loaded" with no entries.
    act(() => {
      latestSub(state.healthSubs)?.emit([]);
      latestSub(state.competitionSubs)?.emit([]);
    });
    // Initial chip is `none` (no metrics filled).
    const dateNavBefore = document.querySelector("[data-chip-state]");
    expect(dateNavBefore?.getAttribute("data-chip-state")).toBe("none");
    // Type into sleepTime.
    setSleepTime("8");
    // Synchronously - no advanceTimers - the chip should update.
    const dateNavAfter = document.querySelector("[data-chip-state]");
    expect(dateNavAfter?.getAttribute("data-chip-state")).toBe("some");
    // Debounce hasn't fired yet.
    expect(state.setDoc).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(state.setDoc).toHaveBeenCalledTimes(1);
  });

  it("MetricInputRow numeric input keeps trailing decimal", () => {
    renderWithProvider("/health");
    act(() => {
      latestSub(state.healthSubs)?.emit([]);
      latestSub(state.competitionSubs)?.emit([]);
    });
    const sleep = inputForMetric("Total Sleep Time");
    fireEvent.change(sleep, { target: { value: "1." } });
    expect(sleep.value).toBe("1.");
  });

  it("MetricInputRow numeric input keeps bare zero", () => {
    renderWithProvider("/health");
    act(() => {
      latestSub(state.healthSubs)?.emit([]);
      latestSub(state.competitionSubs)?.emit([]);
    });
    const sleep = inputForMetric("Total Sleep Time");
    fireEvent.change(sleep, { target: { value: "0" } });
    expect(sleep.value).toBe("0");
  });

  it("MetricInputRow numeric input keeps leading zero", () => {
    renderWithProvider("/health");
    act(() => {
      latestSub(state.healthSubs)?.emit([]);
      latestSub(state.competitionSubs)?.emit([]);
    });
    const sleep = inputForMetric("Total Sleep Time");
    fireEvent.change(sleep, { target: { value: "07" } });
    expect(sleep.value).toBe("07");
  });

  it("snapshot updates input value when parent prop changes (not mid-typing)", () => {
    renderWithProvider("/health");
    act(() => {
      latestSub(state.healthSubs)?.emit([]);
      latestSub(state.competitionSubs)?.emit([]);
    });
    const sleep = inputForMetric("Total Sleep Time");
    expect(sleep.value).toBe("");
    // External edit (e.g., another tab) lands via the snapshot listener.
    act(() => {
      latestSub(state.healthSubs)?.emit([
        {
          path: `users/u1/healthEntries/${TODAY_ISO}`,
          data: {
            version: 1,
            date: TODAY_ISO,
            hydration: 0,
            sleepTime: 5,
            sleepEfficiency: 0,
            protein: 0,
            leanMass: 0,
            availability: {
              practiceHeld: null,
              practiceParticipation: null,
              gameHeld: null,
              gameParticipation: null,
            },
          },
        },
      ]);
    });
    expect(sleep.value).toBe("5");
  });
});
