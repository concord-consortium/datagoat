import { describe, expect, it } from "vitest";
import { normalizeMetricName, suggestUniqueName } from "./metricNameValidation";

describe("normalizeMetricName", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normalizeMetricName("  Hydration  ")).toBe("hydration");
  });

  it("is case-insensitive", () => {
    expect(normalizeMetricName("HYDRATION")).toBe("hydration");
  });

  it("collapses internal whitespace runs to a single space", () => {
    // "Lap  Time" (double space) and "Lap Time" must normalize alike so
    // they're flagged as duplicates of each other.
    expect(normalizeMetricName("Lap  Time")).toBe("lap time");
    expect(normalizeMetricName("Lap\tTime")).toBe("lap time");
  });
});

describe("suggestUniqueName", () => {
  it("appends (2) when the base name is taken", () => {
    expect(suggestUniqueName("Hydration", new Set(["hydration"]))).toBe(
      "Hydration (2)",
    );
  });

  it("skips to (3) when (2) is also taken", () => {
    expect(
      suggestUniqueName("Hydration", new Set(["hydration", "hydration (2)"])),
    ).toBe("Hydration (3)");
  });

  it("strips an existing trailing (n) and resolves off the base", () => {
    expect(
      suggestUniqueName("Hydration (2)", new Set(["hydration", "hydration (2)"])),
    ).toBe("Hydration (3)");
  });

  it("matches taken names case-insensitively while preserving the typed casing", () => {
    expect(suggestUniqueName("hydration", new Set(["hydration"]))).toBe(
      "hydration (2)",
    );
  });

  it("trims the desired name before suffixing", () => {
    expect(suggestUniqueName("  Hydration  ", new Set(["hydration"]))).toBe(
      "Hydration (2)",
    );
  });

  it("collapses internal whitespace in the suggested name", () => {
    // "Lap  Time" (double space) collides with the canonical "lap time";
    // the suggestion must be the canonical "Lap Time (2)", not a
    // double-spaced "Lap  Time (2)".
    expect(suggestUniqueName("Lap  Time", new Set(["lap time"]))).toBe(
      "Lap Time (2)",
    );
  });

  it("does not emit a leading space when the base is empty (numeric-only name)", () => {
    // "(2)" strips to an empty base; the candidate must be "(3)" (not
    // " (3)"), so that after the form trims on submit it no longer
    // collides with the taken "(2)".
    expect(suggestUniqueName("(2)", new Set(["(2)"]))).toBe("(3)");
  });
});
