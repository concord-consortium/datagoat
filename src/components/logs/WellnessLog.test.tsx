// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import type { ProfileLoadState, UserProfile } from "../../types/profile";
import type { DataLoadState, WellnessEntry } from "../../types/data";
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
  trackedWellnessMetrics: [
    "hydration",
    "sleepTime",
    "sleepEfficiency",
    "protein",
    "leanMass",
    "availability",
  ],
  trackedPerformanceMetrics: [],
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
  wellness: { status: "loaded", entries: [] } as DataLoadState<WellnessEntry>,
  setWellnessEntryMock: vi.fn() as (...args: unknown[]) => void,
  customMetrics: [] as CustomMetricDef[],
  useLightweightMocks: true,
}));

// Hoisted state for the real-provider tests. Same fixture as
// DataContext.test.tsx.
const state = vi.hoisted<FirestoreMockState>(() => ({
  setDoc: vi.fn(async () => undefined),
  wellnessSubs: [],
  performanceSubs: [],
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
          wellness: ctx.wellness,
          setWellnessEntry: ctx.setWellnessEntryMock,
        } as unknown as ReturnType<typeof actual.useData>;
      }
      return actual.useData();
    },
  };
});

vi.mock("firebase/firestore", () => firestoreMockFactory(state));
vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("../../utils/logError", () => ({ logError: vi.fn() }));

import { WellnessLog } from "./WellnessLog";
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
        <Route path="/wellness" element={<WellnessLog />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderWithProvider(initialPath: string) {
  return render(
    <DataProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/wellness" element={<WellnessLog />} />
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
  ctx.wellness = { status: "loaded", entries: [] };
  ctx.customMetrics = [];
  resetFirestoreState(state);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WellnessLog route + redirect", () => {
  it("malformed ?date= falls back to /wellness", () => {
    render(
      <MemoryRouter initialEntries={["/wellness?date=NOT-A-DATE"]}>
        <Routes>
          <Route path="/wellness" element={<WellnessLog />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(document.querySelectorAll("table").length).toBeGreaterThan(0);
  });

  it("?date= outside [0, HISTORY] falls back to /wellness", () => {
    render(
      <MemoryRouter initialEntries={["/wellness?date=2099-01-01"]}>
        <Routes>
          <Route path="/wellness" element={<WellnessLog />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(document.querySelectorAll("table").length).toBeGreaterThan(0);
  });

  it("typing into a numeric metric calls setWellnessEntry per keystroke", () => {
    renderAt("/wellness");
    setSleepTime("8");
    expect(ctx.setWellnessEntryMock).toHaveBeenCalledWith(
      TODAY_ISO,
      expect.objectContaining({ sleepTime: 8 }),
    );
    setProtein("1.5");
    expect(ctx.setWellnessEntryMock).toHaveBeenCalledWith(
      TODAY_ISO,
      expect.objectContaining({ protein: 1.5 }),
    );
    // The component no longer debounces; debounce lives in DataContext.
    expect(ctx.setWellnessEntryMock).toHaveBeenCalledTimes(2);
  });
});

describe("WellnessLog custom-metric row", () => {
  it("renders the custom metric name as a link to /wellness/:customId", () => {
    // Regression: the custom row was rendering name as plain text
    // because the <MetricInputRow> call site omitted detailHref. Match
    // the built-in branch and PerformanceLog parity by linking to the
    // metric-detail route.
    const customDef: CustomMetricDef = {
      id: "c_abc1234567",
      ownerId: "u1",
      name: "Caffeine Intake",
      metricType: "wellness",
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
      profile: { ...PROFILE, trackedWellnessMetrics: [customDef.id] },
    };
    renderAt("/wellness");
    const link = screen.getByRole("link", { name: "Caffeine Intake" });
    expect(link).toHaveAttribute("href", "/wellness/c_abc1234567");
  });
});

describe("WellnessLog chip reactivity to tracked-metric changes", () => {
  it("chip recomputes when trackedWellnessMetrics changes via UserContext", () => {
    // Tracking only hydration, with hydration filled in the entry -> "all".
    ctx.loadState = {
      status: "loaded",
      profile: { ...PROFILE, trackedWellnessMetrics: ["hydration"] },
    };
    ctx.wellness = {
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
    const { rerender } = renderAt("/wellness");
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
        trackedWellnessMetrics: ["hydration", "sleepTime"],
      },
    };
    rerender(
      <MemoryRouter initialEntries={["/wellness"]}>
        <Routes>
          <Route path="/wellness" element={<WellnessLog />} />
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

describe("WellnessLog optimistic state via real DataContext", () => {
  beforeEach(() => {
    ctx.useLightweightMocks = false;
    state.user.current = { uid: "u1" };
  });

  it("chip updates per keystroke (no 500ms lag)", async () => {
    vi.useFakeTimers();
    renderWithProvider("/wellness");
    // Drive the initial wellness snapshot to "loaded" with no entries.
    act(() => {
      latestSub(state.wellnessSubs)?.emit([]);
      latestSub(state.performanceSubs)?.emit([]);
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
    renderWithProvider("/wellness");
    act(() => {
      latestSub(state.wellnessSubs)?.emit([]);
      latestSub(state.performanceSubs)?.emit([]);
    });
    const sleep = inputForMetric("Total Sleep Time");
    fireEvent.change(sleep, { target: { value: "1." } });
    expect(sleep.value).toBe("1.");
  });

  it("MetricInputRow numeric input keeps bare zero", () => {
    renderWithProvider("/wellness");
    act(() => {
      latestSub(state.wellnessSubs)?.emit([]);
      latestSub(state.performanceSubs)?.emit([]);
    });
    const sleep = inputForMetric("Total Sleep Time");
    fireEvent.change(sleep, { target: { value: "0" } });
    expect(sleep.value).toBe("0");
  });

  it("MetricInputRow numeric input keeps leading zero", () => {
    renderWithProvider("/wellness");
    act(() => {
      latestSub(state.wellnessSubs)?.emit([]);
      latestSub(state.performanceSubs)?.emit([]);
    });
    const sleep = inputForMetric("Total Sleep Time");
    fireEvent.change(sleep, { target: { value: "07" } });
    expect(sleep.value).toBe("07");
  });

  it("snapshot updates input value when parent prop changes (not mid-typing)", () => {
    renderWithProvider("/wellness");
    act(() => {
      latestSub(state.wellnessSubs)?.emit([]);
      latestSub(state.performanceSubs)?.emit([]);
    });
    const sleep = inputForMetric("Total Sleep Time");
    expect(sleep.value).toBe("");
    // External edit (e.g., another tab) lands via the snapshot listener.
    act(() => {
      latestSub(state.wellnessSubs)?.emit([
        {
          path: `users/u1/wellnessEntries/${TODAY_ISO}`,
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
