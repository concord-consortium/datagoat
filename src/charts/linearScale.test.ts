import { describe, it, expect } from "vitest";
import { linearScale } from "./linearScale";

describe("linearScale", () => {
  it("maps domain endpoints to range endpoints", () => {
    const s = linearScale([0, 100], [0, 140]);
    expect(s(0)).toBe(0);
    expect(s(100)).toBe(140);
  });

  it("maps the midpoint linearly", () => {
    const s = linearScale([0, 100], [0, 140]);
    expect(s(50)).toBe(70);
  });

  it("supports inverted SVG-y ranges (high domain → top of plot)", () => {
    // Standard wellness % chart: 0% at the bottom (y = 140), 100% at the top (y = 0)
    const s = linearScale([0, 100], [140, 0]);
    expect(s(0)).toBe(140);
    expect(s(100)).toBe(0);
    expect(s(50)).toBe(70);
  });

  it("supports inverted domains (low raw value → top of plot, e.g. Hydration 1..8)", () => {
    // Hydration: 1 at the top (y = 0), 8 at the bottom (y = 140)
    const s = linearScale([1, 8], [0, 140]);
    expect(s(1)).toBe(0);
    expect(s(8)).toBe(140);
  });

  it("guards against zero-span domains", () => {
    const s = linearScale([5, 5], [0, 100]);
    expect(s(5)).toBe(0);
    expect(Number.isFinite(s(7))).toBe(true);
  });
});
