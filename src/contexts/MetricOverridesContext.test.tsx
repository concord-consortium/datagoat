// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const setDocSpy = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
// Sentinel returned by the mocked deleteField() so the test can assert
// the payload contains it for cleared fields.
const DELETE_SENTINEL = { __delete: true };
vi.mock("firebase/firestore", () => ({
  // The collection ref carries the joined path so the test can verify
  // the snapshot listener is pointed at the user subcollection.
  collection: (_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  }),
  deleteField: () => DELETE_SENTINEL,
  // doc() accepts a variadic path (5 segments for our nested case);
  // return the last segment as the doc id and the joined path for
  // assertion.
  doc: (_db: unknown, ...segments: string[]) => ({
    id: segments[segments.length - 1],
    path: segments.join("/"),
  }),
  onSnapshot: () => () => {},
  query: () => ({}),
  serverTimestamp: () => ({ __ts: true }),
  setDoc: (...args: unknown[]) => setDocSpy(...args),
}));
vi.mock("../firebase", () => ({ db: {} }));
vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: { uid: "u1" } }),
}));

import {
  MetricOverridesProvider,
  useMetricOverrides,
  type MetricOverridePatch,
} from "./MetricOverridesContext";
import { getMetricOverride, setMetricOverrides } from "../charts/metricChartConfig";
import type { MetricOverride } from "../types/metricOverrides";

function seed(partial: Partial<MetricOverride>): MetricOverride {
  return {
    // The override doc id is now just the metric id (overrides live at
    // /users/{uid}/metricOverrides/{metricId}).
    id: "leanMass",
    ownerId: "u1",
    metricId: "leanMass",
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

function Probe() {
  const { getOverride } = useMetricOverrides();
  const o = getOverride("leanMass");
  return <div data-testid="goal">{o ? String(o.goalRaw) : "none"}</div>;
}

describe("MetricOverridesProvider", () => {
  beforeEach(() => { setMetricOverrides({}); });

  it("exposes seeded overrides via getOverride", () => {
    render(
      <MetricOverridesProvider initialOverrides={[seed({ goalRaw: 70 })]}>
        <Probe />
      </MetricOverridesProvider>,
    );
    expect(screen.getByTestId("goal").textContent).toBe("70");
  });

  it("registers the chart-config overlay for seeded overrides", () => {
    render(
      <MetricOverridesProvider
        initialOverrides={[seed({ goalRaw: 70, yTopRaw: 90, yBottomRaw: 40 })]}
      >
        <div />
      </MetricOverridesProvider>,
    );
    expect(getMetricOverride("leanMass")).toEqual({
      goalRaw: 70,
      yTopRaw: 90,
      yBottomRaw: 40,
    });
  });

  function captureSave(initial: MetricOverride[] = []) {
    let save: ((m: string, p: MetricOverridePatch) => Promise<void>) | null =
      null;
    function Grab() {
      save = useMetricOverrides().saveOverride;
      return null;
    }
    render(
      <MetricOverridesProvider initialOverrides={initial}>
        <Grab />
      </MetricOverridesProvider>,
    );
    return () => save!;
  }

  it("saveOverride upserts a doc with the deterministic id and ownerId", async () => {
    setDocSpy.mockClear();
    const save = captureSave();
    await save()("leanMass", { goalRaw: 80, yTopRaw: 100, yBottomRaw: 0 });
    expect(setDocSpy).toHaveBeenCalledTimes(1);
    const [ref, payload, options] = setDocSpy.mock.calls[0] as unknown as [
      { id: string; path: string },
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    // Doc id is now just the metric id; the user is encoded in the
    // collection path, eliminating the prior ${uid}_${metricId}
    // collision surface.
    expect(ref.id).toBe("leanMass");
    expect(ref.path).toBe("users/u1/metricOverrides/leanMass");
    expect(payload.ownerId).toBe("u1");
    expect(payload.metricId).toBe("leanMass");
    expect(payload.goalRaw).toBe(80);
    expect(payload.yTopRaw).toBe(100);
    expect(payload.yBottomRaw).toBe(0);
    expect(options).toEqual({ merge: true });
  });

  it("saveOverride writes deleteField() for null axis fields (clearing)", async () => {
    setDocSpy.mockClear();
    const save = captureSave();
    await save()("leanMass", {
      goalRaw: 80,
      yTopRaw: null,
      yBottomRaw: null,
    });
    const [, payload] = setDocSpy.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect(payload.goalRaw).toBe(80);
    expect(payload.yTopRaw).toBe(DELETE_SENTINEL);
    expect(payload.yBottomRaw).toBe(DELETE_SENTINEL);
  });

  it("saveOverride omits axis fields entirely when undefined (no touch)", async () => {
    setDocSpy.mockClear();
    const save = captureSave();
    await save()("leanMass", { goalRaw: 80 });
    const [, payload] = setDocSpy.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect(payload.goalRaw).toBe(80);
    expect("yTopRaw" in payload).toBe(false);
    expect("yBottomRaw" in payload).toBe(false);
  });

  it("saveOverride drops non-finite numeric fields", async () => {
    setDocSpy.mockClear();
    const save = captureSave();
    // Bypass the form's validation: simulate a future caller passing NaN.
    await save()("leanMass", {
      goalRaw: Number.NaN,
      yTopRaw: Number.POSITIVE_INFINITY,
      yBottomRaw: 0,
    });
    const [, payload] = setDocSpy.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect("goalRaw" in payload).toBe(false);
    expect("yTopRaw" in payload).toBe(false);
    expect(payload.yBottomRaw).toBe(0);
  });
});
