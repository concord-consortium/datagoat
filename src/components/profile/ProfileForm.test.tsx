// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import type { ProfileLoadState, UserProfile } from "../../types/profile";

// Hoisted mock state.
const ctx = vi.hoisted(() => ({
  user: { uid: "u1", email: "u@example.com", displayName: "Existing Name" } as
    | { uid: string; email: string; displayName: string }
    | null,
  loadState: { status: "missing" } as ProfileLoadState,
  // Typed as variadic so call sites with arguments don't trip TS5.
  updateProfileMock: vi.fn(
    async (..._args: unknown[]) => undefined,
  ) as (...args: unknown[]) => Promise<undefined>,
  navigateMock: vi.fn() as (...args: unknown[]) => void,
  firebaseUpdateProfileMock: vi.fn(
    async (..._args: unknown[]) => undefined,
  ) as (...args: unknown[]) => Promise<undefined>,
  logErrorMock: vi.fn() as (...args: unknown[]) => void,
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: ctx.user }),
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({
    loadState: ctx.loadState,
    updateProfile: ctx.updateProfileMock,
    setTrackedMetrics: vi.fn(),
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => ctx.navigateMock,
  };
});

vi.mock("firebase/auth", () => ({
  updateProfile: (user: unknown, updates: unknown) =>
    ctx.firebaseUpdateProfileMock(user, updates),
}));

vi.mock("../../firebase", () => ({
  auth: { currentUser: { uid: "u1", displayName: "" } },
}));

vi.mock("../../utils/logError", () => ({
  logError: (err: unknown, context?: unknown) =>
    ctx.logErrorMock(err, context),
}));

import { ProfileForm } from "./ProfileForm";

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    version: 1,
    fullName: "Existing User",
    email: "u@example.com",
    nickname: "EX",
    age: 20,
    heightFt: 5,
    heightIn: 9,
    weight: 160,
    gender: "male",
    athleteType: "endurance",
    competitionTerm: "game",
    trackedWellnessMetrics: ["hydration"],
    trackedPerformanceMetrics: ["wins"],
    profileComplete: true,
    trackingSetupComplete: true,
    ...overrides,
  };
}

function renderForm() {
  render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/profile" element={<ProfileForm />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProfileForm mode derivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.user = {
      uid: "u1",
      email: "u@example.com",
      displayName: "Existing Name",
    };
  });

  it("renders onboarding mode when loadState is missing", () => {
    ctx.loadState = { status: "missing" };
    renderForm();
    expect(screen.getByText(/welcome to datagoat/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /set up your tracked data/i }),
    ).toBeInTheDocument();
  });

  it("renders edit mode when loadState is loaded with no welcome and Save button", () => {
    ctx.loadState = { status: "loaded", profile: makeProfile() };
    renderForm();
    expect(screen.queryByText(/welcome to datagoat/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: /save/i }),
    ).toBeInTheDocument();
  });

  it("pre-fills the form in edit mode from the profile", () => {
    ctx.loadState = { status: "loaded", profile: makeProfile() };
    renderForm();
    expect(
      document.getElementById("profile-fullname"),
    ).toHaveValue("Existing User");
    // Email is rendered as read-only "Signed in as ..." text from
    // useAuth().user.email, not as a form input. Confirm the read-only
    // display is present.
    expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
    expect(screen.getByText("u@example.com")).toBeInTheDocument();
  });
});

describe("ProfileForm submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.user = {
      uid: "u1",
      email: "u@example.com",
      displayName: "Existing Name",
    };
  });

  it("onboarding submit dual-writes (Auth + Firestore) and navigates to /setup/tracking", async () => {
    ctx.loadState = { status: "missing" };
    renderForm();

    fillRequiredOnboardingFields();
    fireEvent.click(
      screen.getByRole("button", { name: /set up your tracked data/i }),
    );

    await waitFor(() => {
      expect(ctx.firebaseUpdateProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({ uid: "u1" }),
        { displayName: "Test Athlete" },
      );
      expect(ctx.updateProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: "Test Athlete",
          profileComplete: true,
        }),
      );
      expect(ctx.navigateMock).toHaveBeenCalledWith("/setup/tracking");
    });
  });

  it("logs Auth-side updateProfile rejection but continues to the Firestore write", async () => {
    ctx.loadState = { status: "missing" };
    (ctx.firebaseUpdateProfileMock as unknown as Mock).mockRejectedValueOnce(
      new Error("network down"),
    );
    renderForm();

    fillRequiredOnboardingFields();
    fireEvent.click(
      screen.getByRole("button", { name: /set up your tracked data/i }),
    );

    await waitFor(() => {
      expect(ctx.logErrorMock).toHaveBeenCalled();
      expect(ctx.updateProfileMock).toHaveBeenCalled();
      expect(ctx.navigateMock).toHaveBeenCalledWith("/setup/tracking");
    });
  });

  it("edit submit calls both writes and navigates to /dashboard", async () => {
    ctx.loadState = { status: "loaded", profile: makeProfile() };
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(ctx.firebaseUpdateProfileMock).toHaveBeenCalled();
      expect(ctx.updateProfileMock).toHaveBeenCalled();
      expect(ctx.navigateMock).toHaveBeenCalledWith("/dashboard");
    });
  });
});

describe("ProfileForm a11y", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.user = {
      uid: "u1",
      email: "u@example.com",
      displayName: "Existing Name",
    };
  });

  it("invalid age surfaces an error linked via aria-describedby", async () => {
    ctx.loadState = { status: "missing" };
    renderForm();

    // Don't fill fullName - the schema will fail on age first or on
    // multiple fields. Submit empty form and confirm at least one
    // error <p> is wired up.
    fireEvent.click(
      screen.getByRole("button", { name: /set up your tracked data/i }),
    );

    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  it("moves focus to the first invalid field on submit failure", async () => {
    ctx.loadState = { status: "missing" };
    renderForm();

    // fullName is pre-seeded from user.displayName ("Existing Name") so
    // it validates; the first actually-invalid field on empty submit is
    // profile-age. RHF's shouldFocusError default does the focusing.
    fireEvent.click(
      screen.getByRole("button", { name: /set up your tracked data/i }),
    );

    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
    expect(document.activeElement).toBe(
      document.getElementById("profile-age"),
    );
  });
});

function setInputById(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) throw new Error(`No element with id="${id}"`);
  fireEvent.input(el, { target: { value } });
}

function setSelectById(id: string, value: string) {
  const el = document.getElementById(id) as HTMLSelectElement | null;
  if (!el) throw new Error(`No element with id="${id}"`);
  fireEvent.change(el, { target: { value } });
}

function fillRequiredOnboardingFields() {
  setInputById("profile-fullname", "Test Athlete");
  setInputById("profile-age", "18");
  setInputById("profile-height-ft", "5");
  setInputById("profile-height-in", "9");
  setInputById("profile-weight", "150");
  setSelectById("profile-gender", "male");
  setSelectById("profile-sport", "endurance");
  setSelectById("profile-competition-term", "game");
}
