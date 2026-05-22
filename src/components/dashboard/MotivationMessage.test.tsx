// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

import type { ProfileLoadState, UserProfile } from "../../types/profile";

const ctx = vi.hoisted(() => ({
  loadState: {
    status: "loaded",
    profile: {
      version: 1,
      fullName: "Casey River",
      email: "c@e.com",
      nickname: "",
      age: 18,
      heightFt: 5,
      heightIn: 9,
      weight: 150,
      gender: "male" as const,
      athleteType: "endurance" as const,
      competitionTerm: "game",
      trackedHealthMetrics: [],
      trackedCompetitionMetrics: [],
      profileComplete: true,
      trackingSetupComplete: true,
    } as UserProfile,
  } as ProfileLoadState,
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ loadState: ctx.loadState }),
}));

import {
  MotivationMessage,
  __resetMotivationRotationForTests,
} from "./MotivationMessage";
import { MOTIVATION_MESSAGES } from "../../data/motivationMessages";

describe("MotivationMessage", () => {
  // Rotation cursor is module-scope (so /dashboard remounts pick up
  // mid-cycle). Reset it between tests so each case starts from -1.
  beforeEach(() => {
    __resetMotivationRotationForTests();
  });
  it("first inactive->active transition lands on index 0 (the streak greeting), not index 1", () => {
    // Initial render with active=false (not yet rotated in).
    const { rerender, container } = render(<MotivationMessage active={false} />);
    rerender(<MotivationMessage active={true} />);
    // Index 0 template includes the {name} substitution.
    const expected0 = MOTIVATION_MESSAGES[0].template
      .replace("{name}", "Casey")
      .replace(/<br>/g, "");
    expect(container.textContent).toContain(expected0);
  });

  it("each inactive->active transition advances to the next message", () => {
    const { rerender, container } = render(<MotivationMessage active={false} />);

    const seen: string[] = [];
    for (let i = 0; i < MOTIVATION_MESSAGES.length; i++) {
      // active toggles false -> true to fire the rotation effect.
      rerender(<MotivationMessage active={false} />);
      rerender(<MotivationMessage active={true} />);
      seen.push(container.textContent ?? "");
    }

    // The visible text should have changed across rotations - confirm
    // the second rotation is a different message than the first.
    expect(seen[0]).not.toEqual(seen[1]);

    // Each rendered message should match its template (with name +
    // <br> normalization) at the corresponding index.
    for (let i = 0; i < MOTIVATION_MESSAGES.length; i++) {
      const expected = MOTIVATION_MESSAGES[i].template
        .replace(/\{name\}/g, "Casey")
        .replace(/<br>/g, "");
      expect(seen[i]).toContain(expected);
    }
  });

  it("wraps back to index 0 after the final message", () => {
    const total = MOTIVATION_MESSAGES.length;
    const { rerender, container } = render(<MotivationMessage active={false} />);

    // Advance through all messages (1 .. total).
    for (let i = 0; i < total; i++) {
      rerender(<MotivationMessage active={false} />);
      rerender(<MotivationMessage active={true} />);
    }
    // One more cycle - should wrap to index 0 (first message).
    rerender(<MotivationMessage active={false} />);
    rerender(<MotivationMessage active={true} />);
    const expected0 = MOTIVATION_MESSAGES[0].template
      .replace(/\{name\}/g, "Casey")
      .replace(/<br>/g, "");
    expect(container.textContent).toContain(expected0);
  });

  it("rotation cursor survives unmount/remount within a page-load", () => {
    // First mount: advance once -> message 0.
    const r1 = render(<MotivationMessage active={false} />);
    r1.rerender(<MotivationMessage active={true} />);
    const expected0 = MOTIVATION_MESSAGES[0].template
      .replace(/\{name\}/g, "Casey")
      .replace(/<br>/g, "");
    expect(r1.container.textContent).toContain(expected0);
    r1.unmount();

    // Second mount (simulates leaving /dashboard and returning): the
    // FIRST inactive->active transition should land on message 1, not
    // message 0. Mount-lifetime state would replay message 0 here.
    const r2 = render(<MotivationMessage active={false} />);
    r2.rerender(<MotivationMessage active={true} />);
    const expected1 = MOTIVATION_MESSAGES[1].template
      .replace(/\{name\}/g, "Casey")
      .replace(/<br>/g, "");
    expect(r2.container.textContent).toContain(expected1);
    expect(r2.container.textContent).not.toContain(expected0);
    r2.unmount();
  });

  it("does not advance while active stays true (rotation only on transition)", () => {
    const { rerender, container } = render(<MotivationMessage active={false} />);
    rerender(<MotivationMessage active={true} />);
    const after1 = container.textContent;
    // Re-render with active still true; should not rotate.
    rerender(<MotivationMessage active={true} />);
    expect(container.textContent).toBe(after1);
  });

  it("uses the nickname when set, falls back to first name otherwise, and (name) when both empty", () => {
    // Nickname wins.
    ctx.loadState = {
      ...ctx.loadState,
      profile: { ...(ctx.loadState as { profile: UserProfile }).profile, nickname: "Slick" },
    } as ProfileLoadState;
    const { rerender, container, unmount } = render(
      <MotivationMessage active={false} />,
    );
    rerender(<MotivationMessage active={true} />);
    expect(container.textContent).toContain("Slick");
    unmount();

    // Rotation cursor is module-scope; reset between sub-cases so each
    // sub-case lands on message 0, which carries the {name} token.
    // Without the reset the cursor would advance into a message that
    // omits {name}, leaving the name assertion nothing to match.
    __resetMotivationRotationForTests();

    // No nickname -> first token of fullName.
    ctx.loadState = {
      ...ctx.loadState,
      profile: {
        ...(ctx.loadState as { profile: UserProfile }).profile,
        nickname: "",
        fullName: "Jordan Patel",
      },
    } as ProfileLoadState;
    const r2 = render(<MotivationMessage active={false} />);
    r2.rerender(<MotivationMessage active={true} />);
    expect(r2.container.textContent).toContain("Jordan");
    expect(r2.container.textContent).not.toContain("Patel");
    r2.unmount();

    __resetMotivationRotationForTests();

    // Both empty -> "(name)" placeholder.
    ctx.loadState = {
      ...ctx.loadState,
      profile: {
        ...(ctx.loadState as { profile: UserProfile }).profile,
        nickname: "",
        fullName: "",
      },
    } as ProfileLoadState;
    const r3 = render(<MotivationMessage active={false} />);
    r3.rerender(<MotivationMessage active={true} />);
    expect(r3.container.textContent).toContain("(name)");
  });
});
