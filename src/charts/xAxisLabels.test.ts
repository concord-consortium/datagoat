import { describe, it, expect } from "vitest";
import { xAxisLabelIndices } from "./xAxisLabels";

describe("xAxisLabelIndices", () => {
  it("labels every day at 7d", () => {
    const idx = xAxisLabelIndices("7d", 7);
    expect([...idx].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("labels every 3 days at 2w (always including first and last)", () => {
    const idx = xAxisLabelIndices("2w", 14);
    expect(idx.has(0)).toBe(true);
    expect(idx.has(13)).toBe(true);
    // Day 3, 6, 9, 12 also labeled
    expect(idx.has(3)).toBe(true);
    expect(idx.has(6)).toBe(true);
  });

  it("labels every 7 days at 30d (always including first and last)", () => {
    const idx = xAxisLabelIndices("30d", 30);
    expect(idx.has(0)).toBe(true);
    expect(idx.has(29)).toBe(true);
    expect(idx.has(7)).toBe(true);
    expect(idx.has(14)).toBe(true);
    expect(idx.has(21)).toBe(true);
  });

  it("labels every 15 days at 3mo / 6mo / 1y (with first and last)", () => {
    const idx3 = xAxisLabelIndices("3mo", 90);
    expect(idx3.has(0)).toBe(true);
    expect(idx3.has(89)).toBe(true);
    expect(idx3.has(15)).toBe(true);
    expect(idx3.has(45)).toBe(true);

    const idx1y = xAxisLabelIndices("1y", 365);
    expect(idx1y.has(0)).toBe(true);
    expect(idx1y.has(364)).toBe(true);
  });

  it("always includes the only index when length is 1", () => {
    const idx = xAxisLabelIndices("7d", 1);
    expect(idx.has(0)).toBe(true);
    expect(idx.size).toBe(1);
  });

  it("returns an empty set when length is 0", () => {
    const idx = xAxisLabelIndices("7d", 0);
    expect(idx.size).toBe(0);
  });
});
