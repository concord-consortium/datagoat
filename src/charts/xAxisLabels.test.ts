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

  it("labels every 15 days at 3mo (with first and last)", () => {
    const idx3 = xAxisLabelIndices("3mo", 90);
    expect(idx3.has(0)).toBe(true);
    expect(idx3.has(89)).toBe(true);
    expect(idx3.has(15)).toBe(true);
    expect(idx3.has(45)).toBe(true);
  });

  it("labels every 30 days at 6mo (~7 labels)", () => {
    const idx = xAxisLabelIndices("6mo", 180);
    expect(idx.has(0)).toBe(true);
    expect(idx.has(179)).toBe(true);
    expect(idx.has(30)).toBe(true);
    expect(idx.has(60)).toBe(true);
    expect(idx.has(90)).toBe(true);
    // No more than ~7 labels — long ranges with step 15 (the old rule)
    // would render way too many.
    expect(idx.size).toBeLessThanOrEqual(8);
  });

  it("labels every 60 days at 1y (~7 labels)", () => {
    const idx = xAxisLabelIndices("1y", 365);
    expect(idx.has(0)).toBe(true);
    expect(idx.has(364)).toBe(true);
    expect(idx.has(60)).toBe(true);
    expect(idx.has(120)).toBe(true);
    expect(idx.size).toBeLessThanOrEqual(8);
  });

  it("drops a penultimate intermediate when it would collide with the last", () => {
    // 30d step 7: i=7,14,21,28 — but 28 is just one index from the
    // always-added last (29), so it should be dropped.
    const idx = xAxisLabelIndices("30d", 30);
    expect(idx.has(28)).toBe(false);
    expect(idx.has(21)).toBe(true);
    expect(idx.has(29)).toBe(true);
  });

  it("drops the trailing intermediate at 2w when it's adjacent to the last", () => {
    // 2w step 3: i=3,6,9,12 — 12 is one before last (13), drop it.
    const idx = xAxisLabelIndices("2w", 14);
    expect(idx.has(12)).toBe(false);
    expect(idx.has(9)).toBe(true);
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
