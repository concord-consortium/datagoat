import { describe, it, expect } from "vitest";
import { seededRng, randomInt, randomFloat, hashSeed } from "./randomValues";

describe("seededRng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    for (let i = 0; i < 5; i++) {
      expect(a()).toBe(b());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = seededRng(1);
    const b = seededRng(2);
    expect(a()).not.toBe(b());
  });

  it("returns floats in [0, 1)", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("randomInt", () => {
  it("returns inclusive integers in the requested range", () => {
    const rng = seededRng(123);
    for (let i = 0; i < 100; i++) {
      const v = randomInt(rng, 1, 8);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(8);
    }
  });

  it("returns the only value when min === max", () => {
    const rng = seededRng(0);
    expect(randomInt(rng, 5, 5)).toBe(5);
  });
});

describe("randomFloat", () => {
  it("rounds to the requested number of decimal places", () => {
    const rng = seededRng(99);
    for (let i = 0; i < 50; i++) {
      const v = randomFloat(rng, 1.2, 2.0, 1);
      // Values like 1.2, 1.3, ..., 2.0 only — verify by checking 10*v is integer.
      expect(Math.round(v * 10)).toBe(v * 10);
      expect(v).toBeGreaterThanOrEqual(1.2);
      expect(v).toBeLessThanOrEqual(2.0);
    }
  });
});

describe("hashSeed", () => {
  it("returns the same hash for the same string", () => {
    expect(hashSeed("hydration:0")).toBe(hashSeed("hydration:0"));
  });

  it("returns different hashes for different strings", () => {
    expect(hashSeed("hydration:0")).not.toBe(hashSeed("hydration:1"));
    expect(hashSeed("hydration:0")).not.toBe(hashSeed("sleepTime:0"));
  });

  it("returns a non-negative integer", () => {
    const h = hashSeed("anything");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
  });
});
