// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolveRouteMeta } from "./routeMeta";
import type { CustomMetricDef } from "../types/customMetrics";

function customDef(
  id: string,
  name: string,
  metricType: "health" | "competition",
): CustomMetricDef {
  return {
    id,
    ownerId: "u1",
    name,
    metricType,
    primitive: "numeric",
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
  it("resolves a custom health metric title at /health/:metricId", () => {
    const customs = [customDef("c_stretch", "Stretch Time", "health")];
    const meta = resolveRouteMeta("/health/c_stretch", customs);
    expect(meta?.title).toBe("Stretch Time");
    expect(meta?.backTo).toBe("/health");
  });

  it("resolves a custom competition metric title at /competition/:metricId", () => {
    const customs = [customDef("c_5k", "5K Time", "competition")];
    const meta = resolveRouteMeta("/competition/c_5k", customs);
    expect(meta?.title).toBe("5K Time");
    expect(meta?.backTo).toBe("/competition");
  });

  it("does NOT resolve a health URL to a competition custom (and vice versa)", () => {
    // Cross-type access by id should fall through to null so MetricDetail
    // bounces back to the right log instead of rendering with the wrong
    // entry map.
    const healthCustom = [customDef("c_w", "Stretch Time", "health")];
    const competitionCustom = [customDef("c_p", "5K Time", "competition")];
    expect(resolveRouteMeta("/competition/c_w", healthCustom)).toBeNull();
    expect(resolveRouteMeta("/health/c_p", competitionCustom)).toBeNull();
  });

  it("returns null for an unknown id when customs are empty", () => {
    expect(resolveRouteMeta("/health/c_unknown", [])).toBeNull();
    expect(resolveRouteMeta("/competition/c_unknown", [])).toBeNull();
  });

  it("prefers a built-in metric over a custom with the same id", () => {
    // Built-in ids never collide with c_-prefixed customs in practice,
    // but the resolver checks built-ins first regardless. This guards
    // the lookup order from regressing.
    const customs = [customDef("hydration", "Override", "health")];
    const meta = resolveRouteMeta("/health/hydration", customs);
    expect(meta?.title).toBe("Hydration");
  });

  it("titles the create form at /add-metric/:type/new", () => {
    expect(resolveRouteMeta("/add-metric/health/new")?.title).toBe(
      "New Health Metric",
    );
    expect(resolveRouteMeta("/add-metric/competition/new")?.title).toBe(
      "New Competition Metric",
    );
  });

  it("titles the edit form at /add-metric/:type/:metricId with the metric name", () => {
    const customs = [
      customDef("c_stretch", "Stretch Time", "health"),
      customDef("c_5k", "5K Time", "competition"),
    ];
    expect(
      resolveRouteMeta("/add-metric/health/c_stretch", customs)?.title,
    ).toBe("Stretch Time");
    expect(
      resolveRouteMeta("/add-metric/competition/c_5k", customs)?.title,
    ).toBe("5K Time");
  });

  it("does NOT title an /add-metric/:type/:metricId URL whose :type mismatches the metric", () => {
    // The form's <Navigate replace /> will redirect to the canonical
    // route; returning null here avoids briefly rendering the wrong title.
    const customs = [customDef("c_5k", "5K Time", "competition")];
    expect(resolveRouteMeta("/add-metric/health/c_5k", customs)).toBeNull();
  });

  it("matches /add-metric/:type/new before /add-metric/:type/:metricId", () => {
    // Regression guard: if pattern order is wrong, "new" gets captured as
    // :metricId and falls through to a null lookup. The title should always
    // be the create-form title, never null, for the literal /new URL.
    const customs = [customDef("new", "Decoy", "health")];
    expect(resolveRouteMeta("/add-metric/health/new", customs)?.title).toBe(
      "New Health Metric",
    );
  });
});
