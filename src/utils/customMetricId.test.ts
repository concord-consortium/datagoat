import { describe, expect, it } from "vitest";
import { mintCustomMetricId } from "./customMetricId";

describe("mintCustomMetricId", () => {
  it("returns a string starting with 'c_'", () => {
    expect(mintCustomMetricId().startsWith("c_")).toBe(true);
  });

  it("produces unique values across many invocations", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(mintCustomMetricId());
    expect(ids.size).toBe(1000);
  });
});
