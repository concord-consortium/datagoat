// @vitest-environment node
import { describe, it, expectTypeOf } from "vitest";
import type {
  CustomMetricDef,
  CustomMetricLevel,
  CustomMetricPrimitive,
} from "./customMetrics";

describe("CustomMetricDef", () => {
  it("accepts a numeric primitive without levels", () => {
    const def: CustomMetricDef = {
      id: "c_a",
      ownerId: "u1",
      name: "Steps",
      metricType: "health",
      primitive: "numeric",
      unit: "steps",
      goalRaw: 10000,
      yTopRaw: 20000,
      yBottomRaw: 0,
      avgDecimals: 0,
      inputType: "numeric",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    };
    expectTypeOf(def.primitive).toEqualTypeOf<CustomMetricPrimitive>();
  });

  it("accepts an ordinal primitive with levels", () => {
    const def: CustomMetricDef = {
      id: "c_b",
      ownerId: "u1",
      name: "Mood",
      metricType: "health",
      primitive: "ordinal",
      levels: [
        { label: "Low", value: 1 },
        { label: "Medium", value: 2 },
        { label: "High", value: 3 },
      ],
      yTopRaw: 3,
      yBottomRaw: 1,
      avgDecimals: 1,
      inputType: "radio",
      referenceUrl: "",
      createdAt: 0,
      updatedAt: 0,
    };
    expectTypeOf(def.levels).toEqualTypeOf<CustomMetricLevel[] | undefined>();
  });

  it("allows nominal levels with omitted value", () => {
    const lvl: CustomMetricLevel = { label: "Red", color: "#f00" };
    expectTypeOf(lvl.value).toEqualTypeOf<number | undefined>();
  });
});
