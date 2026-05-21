// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolveRouteMeta } from "./routeMeta";
import type { CustomMetricDef } from "../types/customMetrics";

function customDef(
  id: string,
  name: string,
  metricType: "health" | "performance" | "competition",
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
    expect(resolveRouteMeta("/add-metric/performance/new")?.title).toBe(
      "New Performance Metric",
    );
    expect(resolveRouteMeta("/add-metric/competition/new")?.title).toBe(
      "New Competition Metric",
    );
  });

  it("titles the add-metric list at /add-metric/:type", () => {
    expect(resolveRouteMeta("/add-metric/health")?.title).toBe(
      "Health Metrics",
    );
    expect(resolveRouteMeta("/add-metric/performance")?.title).toBe(
      "Performance Metrics",
    );
    expect(resolveRouteMeta("/add-metric/competition")?.title).toBe(
      "Competition Metrics",
    );
  });

  it("titles the edit form at /add-metric/:type/:metricId with the metric name", () => {
    const customs = [
      customDef("c_stretch", "Stretch Time", "health"),
      customDef("c_sprint", "Sprint Drill", "performance"),
      customDef("c_5k", "5K Time", "competition"),
    ];
    expect(
      resolveRouteMeta("/add-metric/health/c_stretch", customs)?.title,
    ).toBe("Stretch Time");
    expect(
      resolveRouteMeta("/add-metric/performance/c_sprint", customs)?.title,
    ).toBe("Sprint Drill");
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

describe("resolveRouteMeta — location-state backTo override", () => {
  it("overrides the registry backTo when state.backTo is provided", () => {
    // /health/:metricId resolves to backTo: "/health" by default.
    // SortableMetricRow on /setup/tracking passes state.backTo so the
    // back chevron returns the user to /setup/tracking instead.
    const customs = [customDef("c_stretch", "Stretch Time", "health")];
    const meta = resolveRouteMeta("/health/c_stretch", customs, {
      backTo: "/setup/tracking",
    });
    expect(meta?.title).toBe("Stretch Time");
    expect(meta?.backTo).toBe("/setup/tracking");
  });

  it("keeps the registry backTo when no state is provided", () => {
    const customs = [customDef("c_stretch", "Stretch Time", "health")];
    expect(resolveRouteMeta("/health/c_stretch", customs)?.backTo).toBe(
      "/health",
    );
  });

  it("keeps the registry backTo when state is null", () => {
    const customs = [customDef("c_stretch", "Stretch Time", "health")];
    expect(
      resolveRouteMeta("/health/c_stretch", customs, null)?.backTo,
    ).toBe("/health");
  });

  it("keeps the registry backTo when state.backTo is not a string", () => {
    // Defense-in-depth: non-string `backTo` (e.g., undefined or a
    // typo'd field) shouldn't override the registry default.
    const customs = [customDef("c_stretch", "Stretch Time", "health")];
    const meta = resolveRouteMeta("/health/c_stretch", customs, {});
    expect(meta?.backTo).toBe("/health");
  });

  it("returns null untouched when the route does not resolve", () => {
    // An unknown route returns null whether or not state is provided -
    // the override only applies on top of a real RouteMeta.
    expect(
      resolveRouteMeta("/totally-unknown-path", [], {
        backTo: "/setup/tracking",
      }),
    ).toBeNull();
  });
});
