import { describe, expect, it } from "vitest";
import { normalizeMetricName, suggestUniqueName } from "./metricNameValidation";

describe("normalizeMetricName", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normalizeMetricName("  Hydration  ")).toBe("hydration");
  });

  it("is case-insensitive", () => {
    expect(normalizeMetricName("HYDRATION")).toBe("hydration");
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
});
