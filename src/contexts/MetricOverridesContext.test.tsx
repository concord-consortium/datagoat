// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const setDocSpy = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  onSnapshot: () => () => {},
  query: () => ({}),
  serverTimestamp: () => ({ __ts: true }),
  setDoc: (...args: unknown[]) => setDocSpy(...args),
  where: () => ({}),
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
    id: "u1_leanMass",
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

  it("saveOverride upserts a doc with the deterministic id and ownerId", async () => {
    setDocSpy.mockClear();
    let save: ((m: string, p: MetricOverridePatch) => Promise<void>) | null =
      null;
    function Grab() {
      save = useMetricOverrides().saveOverride;
      return null;
    }
    render(
      <MetricOverridesProvider initialOverrides={[]}>
        <Grab />
      </MetricOverridesProvider>,
    );
    await save!("leanMass", { goalRaw: 80, yTopRaw: 100, yBottomRaw: 0 });
    expect(setDocSpy).toHaveBeenCalledTimes(1);
    const [ref, payload, options] = setDocSpy.mock.calls[0] as unknown as [
      { id: string },
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(ref.id).toBe("u1_leanMass");
    expect(payload.ownerId).toBe("u1");
    expect(payload.metricId).toBe("leanMass");
    expect(payload.goalRaw).toBe(80);
    expect(options).toEqual({ merge: true });
  });
});
