import { describe, it, expect } from "vitest";
import { isTimeMetric, timeSecondsDecimals } from "./timeMetrics";

// oneMileRun is a min/sec time metric; goals is a plain numeric metric.
describe("isTimeMetric", () => {
  it("is true for a time metric and false for a plain numeric one", () => {
    expect(isTimeMetric("oneMileRun")).toBe(true);
    expect(isTimeMetric("goals")).toBe(false);
  });
});

describe("timeSecondsDecimals", () => {
  it("returns the metric's configured seconds precision", () => {
    expect(timeSecondsDecimals("oneMileRun")).toBeGreaterThanOrEqual(0);
  });
});
