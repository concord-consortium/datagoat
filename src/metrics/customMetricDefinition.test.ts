// @vitest-environment node
import { describe, it, expect } from "vitest";
import { customAsMetricDefinition } from "./customMetricDefinition";
import type { CustomMetricDef } from "../types/customMetrics";

function baseDef(overrides: Partial<CustomMetricDef> = {}): CustomMetricDef {
  return {
    id: "c_1",
    ownerId: "u1",
    name: "Body Fat",
    metricType: "health",
    primitive: "numeric",
    inputType: "numeric",
    unit: "%",
    referenceUrl: "",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("customAsMetricDefinition", () => {
  it("forwards the custom metric's schedule (parity for every consumer)", () => {
    const def = baseDef({ schedule: { period: "weekly", count: 2 } });
    expect(customAsMetricDefinition(def, "health").schedule).toEqual({
      period: "weekly",
      count: 2,
    });
  });

  it("leaves schedule undefined when the custom metric has none", () => {
    expect(customAsMetricDefinition(baseDef(), "health").schedule).toBeUndefined();
  });

  it("maps a non-empty referenceUrl onto learnMoreUrl, empty onto undefined", () => {
    expect(
      customAsMetricDefinition(baseDef({ referenceUrl: "https://x.test" }), "health")
        .learnMoreUrl,
    ).toBe("https://x.test");
    expect(customAsMetricDefinition(baseDef(), "health").learnMoreUrl).toBeUndefined();
  });

  it("applies the supplied type", () => {
    expect(customAsMetricDefinition(baseDef(), "competition").type).toBe(
      "competition",
    );
  });
});
