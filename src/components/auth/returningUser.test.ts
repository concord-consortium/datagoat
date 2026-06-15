// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isReturningUser, markReturningUser, authLandingPath } from "./returningUser";

describe("returningUser", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports first-time by default and returning after markReturningUser()", () => {
    expect(isReturningUser()).toBe(false);
    markReturningUser();
    expect(isReturningUser()).toBe(true);
  });

  it("authLandingPath maps first-timers to /signup and returning users to /login", () => {
    expect(authLandingPath()).toBe("/signup");
    markReturningUser();
    expect(authLandingPath()).toBe("/login");
  });

  it("treats a throwing localStorage as first-time rather than crashing", () => {
    // Safari Private Browsing / locked-down policies throw on access.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => markReturningUser()).not.toThrow();
    expect(isReturningUser()).toBe(false);
    expect(authLandingPath()).toBe("/signup");
  });
});
