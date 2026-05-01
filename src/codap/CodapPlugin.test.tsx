// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WellnessEntry, PerformanceEntry } from "../types/data";
import type { ProfileLoadState } from "../types/profile";
import type { DataLoadState } from "../types/data";
import type { CodapStatus } from "./codapApi";

interface MockAuthState {
  user: { emailVerified: boolean; email: string | null } | null;
  loading: boolean;
}

const ctx: { authState: MockAuthState } = {
  authState: { user: null, loading: false },
};

const signOutMock = vi.fn(() => Promise.resolve());

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: ctx.authState.user,
    loading: ctx.authState.loading,
    signOut: signOutMock,
  }),
}));

// CodapPluginSignIn pulls in firebase/auth + authProviders via its imports;
// stub those at the boundary so the unauthed branch renders without
// touching real Firebase.
vi.mock("../components/auth/authProviders", () => ({
  googleProvider: { id: "google" } as object,
  facebookProvider: { id: "facebook" } as object,
  signInWithProvider: vi.fn(),
}));

vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>(
    "firebase/auth",
  );
  return {
    ...actual,
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("../firebase", () => ({
  auth: {},
  db: {},
  getAnalyticsLazy: vi.fn(() => Promise.resolve(null)),
}));

// Stub the CODAP wrapper so the verified-Authed branch doesn't try to
// reach a real CODAP host via initializePlugin/postMessage.
const codapState: { status: CodapStatus; error?: string } = {
  status: "connected",
};
const sendDatasetMock = vi.fn(() => Promise.resolve());

vi.mock("./codapApi", () => ({
  useCodapApi: () => ({
    status: codapState.status,
    error: codapState.error,
    sendDataset: sendDatasetMock,
  }),
}));

const userState: { loadState: ProfileLoadState } = {
  loadState: { status: "loading" },
};

vi.mock("../contexts/UserContext", () => ({
  useUser: () => ({ loadState: userState.loadState }),
}));

const dataState: {
  wellness: DataLoadState<WellnessEntry>;
  performance: DataLoadState<PerformanceEntry>;
} = {
  wellness: { status: "loading" },
  performance: { status: "loading" },
};

vi.mock("../contexts/DataContext", () => ({
  useWellnessData: () => dataState.wellness,
  usePerformanceData: () => dataState.performance,
}));

import CodapPlugin from "./CodapPlugin";

describe("CodapPlugin", () => {
  beforeEach(() => {
    signOutMock.mockClear();
    sendDatasetMock.mockClear();
    codapState.status = "connected";
    codapState.error = undefined;
    userState.loadState = { status: "loading" };
    dataState.wellness = { status: "loading" };
    dataState.performance = { status: "loading" };
  });

  it("loading state renders the loading text", () => {
    ctx.authState = { user: null, loading: true };
    render(<CodapPlugin />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("unauthenticated state renders the in-plugin sign-in panel", () => {
    ctx.authState = { user: null, loading: false };
    render(<CodapPlugin />);
    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
  });

  it("authenticated-but-unverified state shows the verify-email notice + sign-out + signed-in-as email", async () => {
    ctx.authState = {
      user: { emailVerified: false, email: "athlete@school.edu" },
      loading: false,
    };
    const user = userEvent.setup();
    render(<CodapPlugin />);
    expect(screen.getByText(/please verify your email/i)).toBeInTheDocument();
    expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
    expect(screen.getByText("athlete@school.edu")).toBeInTheDocument();
    const signOutBtn = screen.getByRole("button", { name: /sign out/i });
    await user.click(signOutBtn);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("authenticated-and-verified state toggles 'Send to CODAP' enable-state and forwards selected datasets to sendDataset", async () => {
    ctx.authState = {
      user: { emailVerified: true, email: "athlete@school.edu" },
      loading: false,
    };
    userState.loadState = {
      status: "loaded",
      profile: {
        version: 1,
        fullName: "Athlete",
        email: "athlete@school.edu",
        nickname: "Athlete",
        age: 16,
        heightFt: 5,
        heightIn: 10,
        weight: 150,
        gender: "unspecified",
        athleteType: "endurance",
        competitionTerm: "season",
        trackedWellnessMetrics: ["hydration", "sleepTime"],
        trackedPerformanceMetrics: ["fortyYardDash"],
        profileComplete: true,
        trackingSetupComplete: true,
      },
    };
    dataState.wellness = {
      status: "loaded",
      entries: [
        {
          version: 1,
          date: "2026-04-01",
          hydration: 64,
          sleepTime: 7,
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
    dataState.performance = {
      status: "loaded",
      entries: [
        {
          version: 1,
          date: "2026-04-01",
          metrics: { fortyYardDash: 4.5 },
        },
      ],
    };

    const user = userEvent.setup();
    render(<CodapPlugin />);

    const sendBtn = screen.getByRole("button", { name: /send to codap/i });
    expect(sendBtn).toBeEnabled();

    const [wellnessBox, performanceBox] = screen.getAllByRole("checkbox");
    await user.click(wellnessBox);
    await user.click(performanceBox);
    expect(sendBtn).toBeDisabled();

    await user.click(wellnessBox);
    expect(sendBtn).toBeEnabled();

    await user.click(performanceBox);
    await user.click(sendBtn);

    expect(sendDatasetMock).toHaveBeenCalledTimes(2);
    expect(sendDatasetMock).toHaveBeenNthCalledWith(1, {
      name: "DataGOAT-Wellness",
      title: "Health & Wellness",
      collectionName: "Health-and-Wellness",
      tableName: "Health-and-Wellness",
      attributes: ["date", "hydration", "sleepTime"],
      rows: [{ date: "2026-04-01", hydration: 64, sleepTime: 7 }],
    });
    expect(sendDatasetMock).toHaveBeenNthCalledWith(2, {
      name: "DataGOAT-Performance",
      title: "Performance",
      collectionName: "Performance",
      attributes: ["date", "fortyYardDash"],
      rows: [{ date: "2026-04-01", fortyYardDash: 4.5 }],
    });
  });

  it("authenticated-and-verified state disables 'Send to CODAP' while data or profile is still loading and shows a loading status", () => {
    ctx.authState = {
      user: { emailVerified: true, email: "athlete@school.edu" },
      loading: false,
    };
    userState.loadState = { status: "loading" };
    dataState.wellness = { status: "loading" };
    dataState.performance = { status: "loading" };
    codapState.status = "connected";

    render(<CodapPlugin />);

    expect(screen.getByText(/loading your data/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send to codap/i }),
    ).toBeDisabled();
  });

  it("authenticated-and-verified state ignores load state of unselected datasets", async () => {
    ctx.authState = {
      user: { emailVerified: true, email: "athlete@school.edu" },
      loading: false,
    };
    userState.loadState = {
      status: "loaded",
      profile: {
        version: 1,
        fullName: "Athlete",
        email: "athlete@school.edu",
        nickname: "Athlete",
        age: 16,
        heightFt: 5,
        heightIn: 10,
        weight: 150,
        gender: "unspecified",
        athleteType: "endurance",
        competitionTerm: "season",
        trackedWellnessMetrics: ["hydration"],
        trackedPerformanceMetrics: ["fortyYardDash"],
        profileComplete: true,
        trackingSetupComplete: true,
      },
    };
    dataState.wellness = { status: "loaded", entries: [] };
    dataState.performance = { status: "loading" };
    codapState.status = "connected";

    const user = userEvent.setup();
    render(<CodapPlugin />);

    const sendBtn = screen.getByRole("button", { name: /send to codap/i });
    expect(sendBtn).toBeDisabled();
    expect(screen.getByText(/loading your data/i)).toBeInTheDocument();

    const [, performanceBox] = screen.getAllByRole("checkbox");
    await user.click(performanceBox);

    expect(sendBtn).toBeEnabled();
    expect(
      screen.getByText(/connected\. choose what to send/i),
    ).toBeInTheDocument();
  });

  it("authenticated-and-verified state disables 'Send to CODAP' while CODAP is still connecting", () => {
    ctx.authState = {
      user: { emailVerified: true, email: "athlete@school.edu" },
      loading: false,
    };
    userState.loadState = { status: "missing" };
    dataState.wellness = { status: "loaded", entries: [] };
    dataState.performance = { status: "loaded", entries: [] };
    codapState.status = "connecting";

    render(<CodapPlugin />);

    expect(screen.getByText(/connecting to codap/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send to codap/i }),
    ).toBeDisabled();
  });
});
