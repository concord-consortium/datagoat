// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolveRouteMeta } from "./routeMeta";
import type { CustomMetricDef } from "../types/customMetrics";

function customDef(
  id: string,
  name: string,
  metricType: "wellness" | "performance",
): CustomMetricDef {
  return {
    id,
    ownerId: "u1",
    name,
    metricType,
    inputType: "numeric",
    unit: "",
    goalRaw: 0,
    yTopRaw: 10,
    yBottomRaw: 0,
    avgDecimals: 1,
    referenceUrl: "",
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("resolveRouteMeta — custom metric routing", () => {
  it("resolves a custom wellness metric title at /wellness/:metricId", () => {
    const customs = [customDef("c_stretch", "Stretch Time", "wellness")];
    const meta = resolveRouteMeta("/wellness/c_stretch", customs);
    expect(meta?.title).toBe("Stretch Time");
    expect(meta?.backTo).toBe("/wellness");
  });

  it("resolves a custom performance metric title at /performance/:metricId", () => {
    const customs = [customDef("c_5k", "5K Time", "performance")];
    const meta = resolveRouteMeta("/performance/c_5k", customs);
    expect(meta?.title).toBe("5K Time");
    expect(meta?.backTo).toBe("/performance");
  });

  it("does NOT resolve a wellness URL to a performance custom (and vice versa)", () => {
    // Cross-type access by id should fall through to null so MetricDetail
    // bounces back to the right log instead of rendering with the wrong
    // entry map.
    const wellnessCustom = [customDef("c_w", "Stretch Time", "wellness")];
    const performanceCustom = [customDef("c_p", "5K Time", "performance")];
    expect(resolveRouteMeta("/performance/c_w", wellnessCustom)).toBeNull();
    expect(resolveRouteMeta("/wellness/c_p", performanceCustom)).toBeNull();
  });

  it("returns null for an unknown id when customs are empty", () => {
    expect(resolveRouteMeta("/wellness/c_unknown", [])).toBeNull();
    expect(resolveRouteMeta("/performance/c_unknown", [])).toBeNull();
  });

  it("prefers a built-in metric over a custom with the same id", () => {
    // Built-in ids never collide with c_-prefixed customs in practice,
    // but the resolver checks built-ins first regardless. This guards
    // the lookup order from regressing.
    const customs = [customDef("hydration", "Override", "wellness")];
    const meta = resolveRouteMeta("/wellness/hydration", customs);
    expect(meta?.title).toBe("Hydration");
  });
});
