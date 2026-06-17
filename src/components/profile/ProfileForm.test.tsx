// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
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
    trackedHealthMetrics: ["hydration"],
    trackedCompetitionMetrics: ["wins"],
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

// Same as renderForm but returns the render result (for unmount handling).
function renderFormHandle() {
  return render(
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

  it("groups the two height inputs under a programmatic 'Height' group", () => {
    ctx.loadState = { status: "missing" };
    renderForm();
    const group = screen.getByRole("group", { name: "Height" });
    expect(group).toContainElement(
      document.getElementById("profile-height-ft"),
    );
    expect(group).toContainElement(
      document.getElementById("profile-height-in"),
    );
  });

  it("renders edit mode with no welcome and no bottom action button", () => {
    // Saving is automatic in edit mode, so there is no submit/Done button -
    // return users leave via the back-arrow / Home / hamburger chrome.
    ctx.loadState = { status: "loaded", profile: makeProfile() };
    renderForm();
    expect(screen.queryByText(/welcome to datagoat/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /^done$/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /set up your tracked data/i }),
    ).toBeNull();
  });

  it("stays in onboarding mode when a doc exists but profileComplete is false", () => {
    // Auto-save creates the profile doc before the user finishes, so doc
    // existence alone must not flip onboarding -> edit. profileComplete is
    // the real gate.
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({ profileComplete: false }),
    };
    renderForm();
    expect(screen.getByText(/welcome to datagoat/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /set up your tracked data/i }),
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

  it("keeps the onboarding button while the submit write is in flight (no edit-mode flash)", async () => {
    // The authoritative onboarding write flips profileComplete true, and the
    // optimistic snapshot re-derives mode -> "edit" while the form is still
    // mounted (before navigate() runs). The button must not flash away mid-
    // submit, so it stays mounted as long as the submit is in flight.
    ctx.loadState = { status: "missing" };
    let resolveWrite!: () => void;
    (ctx.updateProfileMock as unknown as Mock).mockImplementationOnce(
      () =>
        new Promise<undefined>((res) => {
          resolveWrite = () => res(undefined);
        }),
    );
    // Fresh element per render so React re-renders (doesn't remount) and RHF's
    // isSubmitting survives across the snapshot-driven loadState change.
    const ui = () => (
      <MemoryRouter initialEntries={["/profile"]}>
        <Routes>
          <Route path="/profile" element={<ProfileForm />} />
        </Routes>
      </MemoryRouter>
    );
    const { rerender } = render(ui());

    fillRequiredOnboardingFields();
    fireEvent.click(
      screen.getByRole("button", { name: /set up your tracked data/i }),
    );

    // Submit is in flight once updateProfile is called (the write is pending).
    await waitFor(() => expect(ctx.updateProfileMock).toHaveBeenCalled());

    // Simulate the optimistic snapshot completing the profile mid-write.
    ctx.loadState = { status: "loaded", profile: makeProfile() };
    act(() => {
      rerender(ui());
    });

    // The onboarding button is still present despite mode having flipped.
    expect(
      screen.getByRole("button", { name: /set up your tracked data/i }),
    ).toBeInTheDocument();

    // Let the write resolve so navigation proceeds (cleanup).
    await act(async () => {
      resolveWrite();
    });
    expect(ctx.navigateMock).toHaveBeenCalledWith("/setup/tracking");
  });

  it("a loaded-but-incomplete doc is onboarding; submit writes profileComplete and proceeds to tracking", async () => {
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({ profileComplete: false }),
    };
    renderForm();

    // Incomplete doc -> onboarding mode (the prefilled fields are valid), so
    // the action is the onboarding button, which still heals profileComplete.
    fireEvent.click(
      screen.getByRole("button", { name: /set up your tracked data/i }),
    );

    await waitFor(() => {
      expect(ctx.updateProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({ profileComplete: true }),
      );
      expect(ctx.navigateMock).toHaveBeenCalledWith("/setup/tracking");
    });
  });

  it("renders a form-level error and does not navigate when the Firestore write rejects", async () => {
    // The button-press write path lives in onboarding now (edit mode's "Done"
    // is a plain exit), so drive the reject through the onboarding submit.
    ctx.loadState = { status: "missing" };
    (ctx.updateProfileMock as unknown as Mock).mockRejectedValueOnce(
      new Error("permission-denied"),
    );
    renderForm();
    fillRequiredOnboardingFields();

    fireEvent.click(
      screen.getByRole("button", { name: /set up your tracked data/i }),
    );

    await waitFor(() => {
      expect(ctx.logErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ stage: "profileForm.updateProfile" }),
      );
    });
    expect(ctx.navigateMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/couldn['’]t save your profile/i),
    ).toBeInTheDocument();
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

describe("ProfileForm auto-save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.user = {
      uid: "u1",
      email: "u@example.com",
      displayName: "Existing Name",
    };
    ctx.loadState = { status: "missing" };
  });

  it("auto-saves the valid subset after the debounce interval", async () => {
    vi.useFakeTimers();
    try {
      renderForm();
      fillRequiredOnboardingFields();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(ctx.updateProfileMock).toHaveBeenCalled();
      const arg = (ctx.updateProfileMock as Mock).mock.calls.at(-1)?.[0];
      expect(arg).toMatchObject({
        fullName: "Test Athlete",
        age: 18,
        heightFt: 5,
        heightIn: 9,
        weight: 150,
        gender: "male",
      });
      // Auto-save must never mark the profile complete - that's the
      // proceed button's job, only when the whole form validates.
      expect(arg).not.toHaveProperty("profileComplete");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not auto-save on initial mount (no user edits yet)", async () => {
    vi.useFakeTimers();
    try {
      renderForm();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(ctx.updateProfileMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps in-progress edits when a later snapshot loads (seed only once)", () => {
    ctx.loadState = { status: "missing" };
    // Fresh element each render so React can't bail out on reference equality -
    // ProfileForm must actually re-render and read the updated loadState.
    const ui = () => (
      <MemoryRouter initialEntries={["/profile"]}>
        <Routes>
          <Route path="/profile" element={<ProfileForm />} />
        </Routes>
      </MemoryRouter>
    );
    const { rerender } = render(ui());
    setInputById("profile-fullname", "In Progress Name");
    // Simulate auto-save having created the doc: the snapshot now resolves to
    // a loaded (still-incomplete) profile carrying a different stored name.
    ctx.loadState = {
      status: "loaded",
      profile: makeProfile({
        fullName: "Stored Name",
        profileComplete: false,
      }),
    };
    act(() => {
      rerender(ui());
    });
    // The user's unsaved edit must survive - the form must not re-seed from
    // the inbound snapshot.
    expect(document.getElementById("profile-fullname")).toHaveValue(
      "In Progress Name",
    );
  });

  it("flushes a pending auto-save when the form unmounts", async () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderFormHandle();
      setInputById("profile-fullname", "Navigated Away");
      // Unmount before the debounce fires (simulating a hamburger nav).
      act(() => {
        unmount();
      });
      expect(ctx.updateProfileMock).toHaveBeenCalled();
      const arg = (ctx.updateProfileMock as Mock).mock.calls.at(-1)?.[0];
      expect(arg).toMatchObject({ fullName: "Navigated Away" });
    } finally {
      vi.useRealTimers();
    }
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
