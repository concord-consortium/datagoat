import { describe, it, expect } from "vitest";
import {
  evaluateBlockFacebookMissingEmail,
  BLOCKED_NO_EMAIL_MESSAGE,
} from "./blockFacebookMissingEmail";

describe("evaluateBlockFacebookMissingEmail", () => {
  it("throws when Facebook provider has no email", () => {
    const event = {
      data: {
        email: null,
        providerData: [{ providerId: "facebook.com" }],
      },
    };
    expect(() => evaluateBlockFacebookMissingEmail(event, "true")).toThrow();
    try {
      evaluateBlockFacebookMissingEmail(event, "true");
    } catch (e) {
      expect((e as Error).message).toBe(BLOCKED_NO_EMAIL_MESSAGE);
      expect((e as Error).message).toMatch(/^\[BLOCKED_NO_EMAIL\]/);
    }
  });

  it("passes when Facebook provider has a valid email", () => {
    const event = {
      data: {
        email: "user@example.com",
        providerData: [{ providerId: "facebook.com" }],
      },
    };
    expect(() =>
      evaluateBlockFacebookMissingEmail(event, "true"),
    ).not.toThrow();
  });

  it("passes when Google provider has no email (only Facebook is blocked)", () => {
    const event = {
      data: {
        email: null,
        providerData: [{ providerId: "google.com" }],
      },
    };
    expect(() =>
      evaluateBlockFacebookMissingEmail(event, "true"),
    ).not.toThrow();
  });

  it("passes for email/password signups", () => {
    const event = {
      data: {
        email: "user@example.com",
        providerData: [{ providerId: "password" }],
      },
    };
    expect(() =>
      evaluateBlockFacebookMissingEmail(event, "true"),
    ).not.toThrow();
  });

  it("kill switch — passes Facebook + null email when FACEBOOK_BLOCKER_ENABLED=false", () => {
    const event = {
      data: {
        email: null,
        providerData: [{ providerId: "facebook.com" }],
      },
    };
    expect(() =>
      evaluateBlockFacebookMissingEmail(event, "false"),
    ).not.toThrow();
  });
});
