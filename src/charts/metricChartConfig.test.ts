import { describe, it, expect } from "vitest";
import {
  customDefToChartConfig,
  getMetricChartConfig,
} from "./metricChartConfig";
import type { CustomMetricDef } from "../types/customMetrics";

function customDef(overrides: Partial<CustomMetricDef> = {}): CustomMetricDef {
  return {
    id: "c_test",
    ownerId: "u1",
    name: "Test",
    metricType: "health",
    primitive: "numeric",
    inputType: "numeric",
    unit: "",
    goalRaw: 5,
    yTopRaw: 10,
    yBottomRaw: 0,
    avgDecimals: 1,
    referenceUrl: "",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("getMetricChartConfig", () => {
  it("returns bar chart config for hydration with inverted axis", () => {
    const c = getMetricChartConfig("hydration");
    expect(c.chartType).toBe("bar");
    expect(c.yTopRaw).toBe(1);
    expect(c.yBottomRaw).toBe(8);
    expect(c.inverted).toBe(true);
    expect(c.goalRaw).toBe(3);
    expect(c.formatValue(3)).toBe("3");
  });

  it("returns bar chart config for sleepEfficiency with percent format", () => {
    const c = getMetricChartConfig("sleepEfficiency");
    expect(c.chartType).toBe("bar");
    expect(c.yTopRaw).toBe(100);
    expect(c.yBottomRaw).toBe(0);
    expect(c.inverted).toBeFalsy();
    expect(c.formatValue(75)).toBe("75%");
    expect(c.goalRaw).toBeUndefined();
  });

  it("returns sane defaults for unknown metric ids", () => {
    const c = getMetricChartConfig("not-a-real-metric");
    expect(c.chartType).toBe("bar");
    expect(c.yTopRaw).toBeGreaterThan(c.yBottomRaw);
    expect(typeof c.formatValue(1)).toBe("string");
  });

  it("formats hydration values without a unit suffix", () => {
    const c = getMetricChartConfig("hydration");
    expect(c.formatValue(3.4)).toBe("3.4");
  });

  it("formats sleepTime in raw hours", () => {
    const c = getMetricChartConfig("sleepTime");
    expect(c.formatValue(7.5)).toBe("7.5");
    expect(c.yTopRaw).toBe(10);
    expect(c.yBottomRaw).toBe(0);
  });
});

describe("customDefToChartConfig", () => {
  it("carries through user y-range, goal, and avgDecimals", () => {
    const def = customDef({
      yTopRaw: 60,
      yBottomRaw: -5,
      goalRaw: 30,
      avgDecimals: 2,
    });
    const c = customDefToChartConfig(def);
    expect(c.chartType).toBe("bar");
    expect(c.yTopRaw).toBe(60);
    expect(c.yBottomRaw).toBe(-5);
    expect(c.goalRaw).toBe(30);
    expect(c.avgDecimals).toBe(2);
  });

  it("folds a `%` unit into formatValue and leaves the separable unit unset", () => {
    const def = customDef({ unit: "%", avgDecimals: 0 });
    const c = customDefToChartConfig(def);
    expect(c.unit).toBeUndefined();
    expect(c.formatValue(82.4)).toBe("82%");
  });

  it("keeps a non-percent unit as the separable unit string", () => {
    const def = customDef({ unit: "min" });
    const c = customDefToChartConfig(def);
    expect(c.unit).toBe("min");
    // formatValue does NOT include the unit; Bars / AverageBadge append it.
    // Trailing zeros drop after the toFixed/Number round-trip, so an
    // integer value renders without a `.0` suffix even with decimals=1.
    expect(c.formatValue(15)).toBe("15");
    expect(c.formatValue(15.4)).toBe("15.4");
  });

  it("drops trailing zeros so integer bounds render cleanly on axis labels", () => {
    // Y/N (and any ordinal whose level values happen to be integers)
    // wants y-axis labels of "1" / "0" rather than "1.0" / "0.0".
    // Averages that aren't whole numbers still show their decimals.
    const def = customDef({ avgDecimals: 1 });
    const c = customDefToChartConfig(def);
    expect(c.formatValue(1)).toBe("1");
    expect(c.formatValue(0)).toBe("0");
    expect(c.formatValue(0.7)).toBe("0.7");
    // Rounding still happens: 0.583 with decimals=1 rounds to "0.6".
    expect(c.formatValue(0.583)).toBe("0.6");
  });

  it("treats an empty unit string as no unit", () => {
    const c = customDefToChartConfig(customDef({ unit: "" }));
    expect(c.unit).toBeUndefined();
  });

  it("clamps avgDecimals to the [0, 100] range Number.prototype.toFixed accepts", () => {
    // toFixed throws RangeError outside [0, 100]; clamp protects against
    // legacy or externally-written Firestore values even when the form
    // already validates on write.
    const overflow = customDefToChartConfig(customDef({ avgDecimals: 250 }));
    expect(() => overflow.formatValue(1)).not.toThrow();
    expect(overflow.avgDecimals).toBeLessThanOrEqual(100);

    const underflow = customDefToChartConfig(customDef({ avgDecimals: -3 }));
    expect(() => underflow.formatValue(1)).not.toThrow();
    expect(underflow.avgDecimals).toBeGreaterThanOrEqual(0);

    const fractional = customDefToChartConfig(customDef({ avgDecimals: 1.7 }));
    expect(Number.isInteger(fractional.avgDecimals)).toBe(true);
  });

  it("falls back to 1 decimal when avgDecimals is non-finite", () => {
    const c = customDefToChartConfig(customDef({ avgDecimals: NaN }));
    expect(c.avgDecimals).toBe(1);
  });

  it("falls back to a safe range when yTopRaw / yBottomRaw are non-finite", () => {
    // Form validates on write, but legacy / externally-written
    // Firestore docs could surface NaN; downstream chart math
    // (linearScale, SVG attrs, randomFloat) must not propagate NaN.
    const c = customDefToChartConfig(
      customDef({ yTopRaw: NaN, yBottomRaw: NaN }),
    );
    expect(Number.isFinite(c.yTopRaw)).toBe(true);
    expect(Number.isFinite(c.yBottomRaw)).toBe(true);
    expect(c.yBottomRaw).toBeLessThan(c.yTopRaw);
  });

  it("falls back to a safe range when yBottomRaw >= yTopRaw (inverted)", () => {
    // Same defense for "finite but inverted" pairs that the form
    // would reject on write but a malformed doc could carry.
    const c = customDefToChartConfig(
      customDef({ yTopRaw: 5, yBottomRaw: 10 }),
    );
    expect(c.yBottomRaw).toBeLessThan(c.yTopRaw);
  });

  it("drops goalRaw to undefined when non-finite", () => {
    const c = customDefToChartConfig(customDef({ goalRaw: NaN }));
    expect(c.goalRaw).toBeUndefined();
  });

  it("returns a numeric random generator that respects user bounds", () => {
    const def = customDef({ yBottomRaw: 0.2, yTopRaw: 0.8, avgDecimals: 1 });
    const c = customDefToChartConfig(def);
    // Sample many values; ALL should fall within the user's range,
    // rounded to the configured decimals. randomInt would mis-bin a
    // non-integer range and produce out-of-range values; randomFloat
    // (used for numeric metrics) keeps them in range.
    const rng = mulberry32(0xa5a5a5);
    for (let i = 0; i < 200; i++) {
      const v = c.random(rng);
      expect(v).toBeGreaterThanOrEqual(0.2);
      expect(v).toBeLessThanOrEqual(0.8);
    }
  });

  it("returns a 0/1 random generator for radio metrics regardless of y-range", () => {
    const def = customDef({
      inputType: "radio",
      yTopRaw: 100,
      yBottomRaw: -50,
    });
    const c = customDefToChartConfig(def);
    const rng = mulberry32(0xb6b6b6);
    const values = new Set<number>();
    for (let i = 0; i < 100; i++) {
      values.add(c.random(rng));
    }
    // Only 0 and 1 should appear.
    for (const v of values) {
      expect(v === 0 || v === 1).toBe(true);
    }
  });
});

// Tiny seedable PRNG so the random-generator tests are deterministic.
// Mirrors the algorithm used in src/charts/randomValues.ts.
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
