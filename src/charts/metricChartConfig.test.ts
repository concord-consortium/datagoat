import { describe, it, expect } from "vitest";
import { getMetricChartConfig } from "./metricChartConfig";

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
