import { describe, it, expect, afterEach } from "vitest";
import {
  customDefToChartConfig,
  getMetricChartConfig,
  getBaseMetricChartConfig,
  getMetricOverride,
  setMetricOverrides,
  setCustomChartConfigs,
} from "./metricChartConfig";
import { formatMetricValue } from "./chartSeries";
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

  it("formats sleepTime as h:mm (time metric)", () => {
    const c = getMetricChartConfig("sleepTime");
    expect(c.formatValue(7.5)).toBe("7:30");
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

  it("samples Y/N (ordinal with No=0/Yes=1 levels) only from {0, 1}", () => {
    const def = customDef({
      primitive: "ordinal",
      inputType: "radio",
      levels: [
        { label: "No", value: 0 },
        { label: "Yes", value: 1 },
      ],
      yTopRaw: 1,
      yBottomRaw: 0,
    });
    const c = customDefToChartConfig(def);
    const rng = mulberry32(0xb6b6b6);
    const values = new Set<number>();
    for (let i = 0; i < 100; i++) {
      values.add(c.random(rng));
    }
    for (const v of values) {
      expect(v === 0 || v === 1).toBe(true);
    }
  });

  it("samples a non-Y/N ordinal (Likert 1..5) only from the defined level values", () => {
    const def = customDef({
      primitive: "ordinal",
      inputType: "radio",
      levels: [
        { label: "Strongly Disagree", value: 1 },
        { label: "Disagree", value: 2 },
        { label: "Neutral", value: 3 },
        { label: "Agree", value: 4 },
        { label: "Strongly Agree", value: 5 },
      ],
      yTopRaw: 5,
      yBottomRaw: 1,
    });
    const c = customDefToChartConfig(def);
    const rng = mulberry32(0xc7c7c7);
    const allowed = new Set([1, 2, 3, 4, 5]);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = c.random(rng);
      expect(allowed.has(v)).toBe(true);
      seen.add(v);
    }
    // 500 samples across 5 buckets should cover every bucket; the
    // regression bug (inputType==="radio" => randomInt(0,1)) would
    // only ever produce 0 or 1, so this size also guards against it.
    expect(seen.size).toBe(5);
  });
});

describe("metric overrides overlay", () => {
  afterEach(() => {
    setMetricOverrides({});
    setCustomChartConfigs({});
  });

  it("merges a partial override on top of the hardcoded config", () => {
    setMetricOverrides({ leanMass: { goalRaw: 70, yTopRaw: 90, yBottomRaw: 40 } });
    const config = getMetricChartConfig("leanMass");
    expect(config.goalRaw).toBe(70);
    expect(config.yTopRaw).toBe(90);
    expect(config.yBottomRaw).toBe(40);
    expect(config.unit).toBe("kg");
    expect(typeof config.formatValue).toBe("function");
    expect(typeof config.random).toBe("function");
  });

  it("merges only the fields the override actually sets", () => {
    setMetricOverrides({ hydration: { goalRaw: 2 } });
    const config = getMetricChartConfig("hydration");
    expect(config.goalRaw).toBe(2);
    expect(config.yTopRaw).toBe(1);
    expect(config.inverted).toBe(true);
  });

  it("getBaseMetricChartConfig ignores the override registry", () => {
    setMetricOverrides({ leanMass: { goalRaw: 70 } });
    expect(getBaseMetricChartConfig("leanMass").goalRaw).toBeUndefined();
    expect(getBaseMetricChartConfig("leanMass").unit).toBe("kg");
  });

  it("getMetricOverride returns the registered partial, or undefined", () => {
    expect(getMetricOverride("leanMass")).toBeUndefined();
    setMetricOverrides({ leanMass: { goalRaw: 70 } });
    expect(getMetricOverride("leanMass")).toEqual({ goalRaw: 70 });
  });
});

describe("getMetricChartConfig — performance built-ins", () => {
  it("returns from-sheet bounds for fortyYardDash as a seconds time metric", () => {
    const c = getMetricChartConfig("fortyYardDash");
    expect(c.chartType).toBe("bar");
    expect(c.yBottomRaw).toBe(4.2);
    expect(c.yTopRaw).toBe(10);
    // Seconds-precision time metric: unit suffix is dropped in favor of
    // timeLayout-driven formatting (no colon needed for seconds-only).
    expect(c.unit).toBeUndefined();
    expect(c.timeLayout).toEqual({ coarsest: "s", precision: "s" });
    expect(c.inverted).toBeFalsy();
    // Time metrics: ascending axis, goal sits low on the chart.
  });

  it("returns guesstimate bounds for oneRepMaxBench with kg unit", () => {
    const c = getMetricChartConfig("oneRepMaxBench");
    expect(c.yBottomRaw).toBe(0);
    expect(c.yTopRaw).toBe(250);
    expect(c.unit).toBe("kg");
  });

  it("returns unitless bounds for reactiveStrengthIndex (no unit)", () => {
    const c = getMetricChartConfig("reactiveStrengthIndex");
    expect(c.yBottomRaw).toBe(0);
    expect(c.yTopRaw).toBe(5);
    expect(c.unit).toBeUndefined();
  });

  it("formats oneMileRun as m:ss with no unit suffix (time metric)", () => {
    const c = getMetricChartConfig("oneMileRun");
    expect(c.formatValue(4.5)).toBe("4:30");
    expect(c.unit).toBeUndefined();
  });

  it("marks time-based perf metrics lowerIsBetter, others not", () => {
    expect(getMetricChartConfig("oneMileRun").lowerIsBetter).toBe(true);
    expect(getMetricChartConfig("tenMeterSprint").lowerIsBetter).toBe(true);
    expect(getMetricChartConfig("fortyYardDash").lowerIsBetter).toBe(true);
    // Higher-is-better perf metrics leave it unset.
    expect(getMetricChartConfig("verticalJump").lowerIsBetter).toBeFalsy();
    expect(getMetricChartConfig("oneRepMaxBench").lowerIsBetter).toBeFalsy();
  });
});

describe("time metric chart formatting", () => {
  it("sleepTime formats as h:mm with no unit suffix", () => {
    const c = getMetricChartConfig("sleepTime");
    expect(c.timeLayout).toEqual({ coarsest: "h", precision: "m" });
    expect(c.unit).toBeUndefined();
    expect(c.formatValue(8.5)).toBe("8:30");
    expect(formatMetricValue("sleepTime", 8.5)).toBe("8:30");
  });

  it("oneMileRun formats as m:ss", () => {
    const c = getMetricChartConfig("oneMileRun");
    expect(c.formatValue(5.5)).toBe("5:30");
  });

  it("a custom time metric formats via its layout and secondsDecimals", () => {
    const c = customDefToChartConfig({
      id: "cx", ownerId: "u", name: "400m", metricType: "performance",
      primitive: "numeric", inputType: "numeric",
      unit: "min", timePrecision: "s", avgDecimals: 1,
      goalRaw: 1, yTopRaw: 2, yBottomRaw: 0, referenceUrl: "",
      createdAt: 0, updatedAt: 0,
    });
    expect(c.timeLayout).toEqual({ coarsest: "m", precision: "s" });
    expect(c.formatValue(1 + 3.45 / 60)).toBe("1:03.5");
  });

  it("seconds-precision built-ins (fortyYardDash) keep sub-second precision, matching the log input's avgDecimals", () => {
    // Regression: competitionConfig/performanceConfig used to hardcode
    // timeFormatValue(layout, 0), which rounded 4.55s to "5" on every
    // chart surface while the log input (which reads avgDecimals ?? 2)
    // kept 2 decimals — input and chart disagreed.
    const c = getMetricChartConfig("fortyYardDash");
    expect(c.avgDecimals).toBe(2);
    expect(c.formatValue(4.55)).toBe("4.55");
    expect(formatMetricValue("fortyYardDash", 4.55)).toBe("4.55");
  });

  it("oneMileRun keeps a tenths-of-a-second precision on the seconds field", () => {
    const c = getMetricChartConfig("oneMileRun");
    expect(c.formatValue(4.5)).toBe("4:30");
    expect(c.formatValue(4 + 30.5 / 60)).toBe("4:30.5");
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
