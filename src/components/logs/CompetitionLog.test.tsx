// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import type { ProfileLoadState, UserProfile } from "../../types/profile";
import type { DataLoadState, CompetitionEntry } from "../../types/data";
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
    "wins",
    "losses",
    "goals",
    "assists",
    "yards",
    "tackles",
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
  fireEvent.change(inputForMetric("Goals"), { target: { value } });
}

function setAssists(value: string) {
  fireEvent.change(inputForMetric("Assists"), { target: { value } });
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
    setAssists("2");
    expect(ctx.setCompetitionEntryMock).toHaveBeenCalledWith(
      TODAY_ISO,
      { metrics: { assists: 2 } },
    );
    expect(ctx.setCompetitionEntryMock).toHaveBeenCalledTimes(2);
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
      r.textContent?.includes("Goals"),
    );
    expect(goalsRow).toBeDefined();
    setGoals("3");
    // Synchronous re-render: total cell now shows "3".
    const updatedRow = Array.from(document.querySelectorAll("tr")).find((r) =>
      r.textContent?.includes("Goals"),
    );
    const totalCell = updatedRow?.querySelector("td");
    expect(totalCell?.textContent).toBe("3");
  });
});
