// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import type { ProfileLoadState, UserProfile } from "../../types/profile";
import type { DataLoadState, CompetitionEntry } from "../../types/data";
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
  trackedHealthMetrics: [],
  trackedCompetitionMetrics: [
    "winningPercentage",
    "scores",
    "times",
    "goals",
  ],
  profileComplete: true,
  trackingSetupComplete: true,
};

const ctx = vi.hoisted(() => ({
  user: { uid: "u1" } as { uid: string } | null,
  loadState: { status: "loaded" } as ProfileLoadState,
  competition: {
    status: "loaded",
    entries: [],
  } as DataLoadState<CompetitionEntry>,
  setCompetitionEntryMock: vi.fn() as (...args: unknown[]) => void,
  customMetrics: [] as CustomMetricDef[],
  useLightweightMocks: true,
}));

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

vi.mock("../../contexts/DataContext", async () => {
  const actual = await vi.importActual<
    typeof import("../../contexts/DataContext")
  >("../../contexts/DataContext");
  return {
    ...actual,
    useData: () => {
      if (ctx.useLightweightMocks) {
        return {
          competition: ctx.competition,
          setCompetitionEntry: ctx.setCompetitionEntryMock,
        } as unknown as ReturnType<typeof actual.useData>;
      }
      return actual.useData();
    },
  };
});

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

vi.mock("firebase/firestore", () => firestoreMockFactory(state));
vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("../../utils/logError", () => ({ logError: vi.fn() }));

import { CompetitionLog } from "./CompetitionLog";
import { DataProvider } from "../../contexts/DataContext";
import { dateAtOffset, HISTORY, toISO } from "../../utils/dates";

const TODAY_ISO = toISO(dateAtOffset(HISTORY));

function inputForMetric(label: string): HTMLInputElement {
  return screen.getByRole("textbox", { name: label }) as HTMLInputElement;
}

function setGoals(value: string) {
  fireEvent.change(inputForMetric("Points/Goals"), { target: { value } });
}

function setScores(value: string) {
  fireEvent.change(inputForMetric("Scores"), { target: { value } });
}

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/competition" element={<CompetitionLog />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderWithProvider(initialPath: string) {
  return render(
    <DataProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/competition" element={<CompetitionLog />} />
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
  ctx.competition = { status: "loaded", entries: [] };
  ctx.customMetrics = [];
  resetFirestoreState(state);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CompetitionLog route + redirect", () => {
  it("malformed ?date= falls back to /competition", () => {
    render(
      <MemoryRouter initialEntries={["/competition?date=NOT-A-DATE"]}>
        <Routes>
          <Route path="/competition" element={<CompetitionLog />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(document.querySelectorAll("table").length).toBeGreaterThan(0);
  });

  it("typing into a metric calls setCompetitionEntry per keystroke", () => {
    renderAt("/competition");
    setGoals("3");
    expect(ctx.setCompetitionEntryMock).toHaveBeenCalledWith(
      TODAY_ISO,
      { metrics: { goals: 3 } },
    );
    setScores("2");
    expect(ctx.setCompetitionEntryMock).toHaveBeenCalledWith(
      TODAY_ISO,
      { metrics: { scores: 2 } },
    );
    expect(ctx.setCompetitionEntryMock).toHaveBeenCalledTimes(2);
  });
});

describe("CompetitionLog ordinal custom metric", () => {
  it("renders an ordinal competition custom metric as a radio group", () => {
    const ordinalDef: CustomMetricDef = {
      id: "c_perf1234567",
      ownerId: "u1",
      name: "Performance",
      metricType: "competition",
      primitive: "ordinal",
      inputType: "radio",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
      levels: [
        { label: "Poor", value: 1 },
        { label: "Great", value: 5 },
      ],
    };
    ctx.customMetrics = [ordinalDef];
    ctx.loadState = {
      status: "loaded",
      profile: {
        ...PROFILE,
        trackedCompetitionMetrics: [ordinalDef.id],
      },
    };
    renderAt("/competition");
    expect(screen.getByRole("radio", { name: /^poor$/i })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^great$/i })).toBeTruthy();
  });
});

describe("CompetitionLog time metrics", () => {
  it("renders the 'times' metric as a multi-field time input", () => {
    renderAt("/competition");
    const row = Array.from(document.querySelectorAll("tr")).find((r) =>
      r.textContent?.includes("Times"),
    );
    expect(row).toBeDefined();
    expect(
      row!.querySelectorAll("input").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("still renders a non-time metric like 'goals' as a single input", () => {
    renderAt("/competition");
    const row = Array.from(document.querySelectorAll("tr")).find((r) =>
      r.textContent?.includes("Points/Goals"),
    );
    expect(row).toBeDefined();
    expect(row!.querySelectorAll("input").length).toBe(1);
  });
});

describe("CompetitionLog Total column for time metrics", () => {
  it("shows a formatted time (not the raw decimal) in the Total cell for the 'times' metric", () => {
    // Regression: the Total cell used to render String(total) even for
    // time metrics, so a stored 5.5 (5m30s) showed "5.5" instead of "5:30".
    ctx.competition = {
      status: "loaded",
      entries: [
        {
          version: 1,
          date: TODAY_ISO,
          metrics: { times: 5.5 },
        },
      ],
    };
    renderAt("/competition");
    const row = Array.from(document.querySelectorAll("tr")).find((r) =>
      r.textContent?.includes("Times"),
    );
    expect(row).toBeDefined();
    const totalCell = row!.querySelector("td");
    expect(totalCell?.textContent).toContain(":");
    expect(totalCell?.textContent).not.toBe("5.5");
  });
});

describe("CompetitionLog optimistic state via real DataContext", () => {
  beforeEach(() => {
    ctx.useLightweightMocks = false;
    state.user.current = { uid: "u1" };
  });

  it("Total column updates per keystroke", () => {
    renderWithProvider("/competition");
    act(() => {
      latestSub(state.healthSubs)?.emit([]);
      latestSub(state.competitionSubs)?.emit([]);
    });
    const goalsRow = Array.from(document.querySelectorAll("tr")).find((r) =>
      r.textContent?.includes("Points/Goals"),
    );
    expect(goalsRow).toBeDefined();
    setGoals("3");
    // Synchronous re-render: total cell now shows "3".
    const updatedRow = Array.from(document.querySelectorAll("tr")).find((r) =>
      r.textContent?.includes("Points/Goals"),
    );
    const totalCell = updatedRow?.querySelector("td");
    expect(totalCell?.textContent).toBe("3");
  });
});
