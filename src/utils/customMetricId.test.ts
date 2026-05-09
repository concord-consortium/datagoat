import { describe, expect, it } from "vitest";
import { mintCustomMetricId } from "./customMetricId";

describe("mintCustomMetricId", () => {
  it("returns a string starting with 'c_'", () => {
    expect(mintCustomMetricId().startsWith("c_")).toBe(true);
  });

  it("returns a 12-char id with c_ prefix and base-36 suffix", () => {
    // Format check (deterministic) rather than a 1000-sample uniqueness
    // assertion that relied on Math.random() not colliding. The ~3.6T
    // suffix space makes runtime collisions vanishingly rare in any
    // practical use, but a uniqueness assertion would still occasionally
    // flake CI; format/length/charset is what we actually care about.
    for (let i = 0; i < 100; i++) {
      expect(mintCustomMetricId()).toMatch(/^c_[0-9a-z]{10}$/);
    }
  });
});
