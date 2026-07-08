// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  rampHexes,
  resolveScaleColors,
  readableTextOn,
  relativeLuminance,
  MOOD_HEXES,
} from "./scaleColors";

const HEX = /^#[0-9a-fA-F]{6}$/;

describe("rampHexes", () => {
  it("returns exactly `count` valid hex colors", () => {
    const out = rampHexes(4, 205);
    expect(out).toHaveLength(4);
    out.forEach((h) => expect(h).toMatch(HEX));
  });

  it("runs pale -> dark (luminance strictly decreases)", () => {
    const out = rampHexes(5, 205);
    const lums = out.map(relativeLuminance);
    for (let i = 1; i < lums.length; i++) {
      expect(lums[i]).toBeLessThan(lums[i - 1]);
    }
    // endpoints are meaningfully different
    expect(lums[0]).toBeGreaterThan(lums[lums.length - 1] + 0.2);
  });

  it("handles count === 1", () => {
    const out = rampHexes(1, 205);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(HEX);
  });
});

describe("resolveScaleColors", () => {
  it("uses the fixed built-in palette by metricId and ignores per-level overrides", () => {
    const levels = MOOD_HEXES.map((_, i) => ({
      label: String(i + 1),
      value: i + 1,
      color: "#ff0000", // user override must NOT win for a built-in
    }));
    const out = resolveScaleColors({ metricId: "mood", levels });
    expect(out).toEqual(MOOD_HEXES);
  });

  it("auto-generates a ramp for a custom scale with no per-level colors", () => {
    const levels = [1, 2, 3, 4].map((v) => ({ label: String(v), value: v }));
    const out = resolveScaleColors({ levels });
    expect(out).toHaveLength(4);
    out.forEach((h) => expect(h).toMatch(HEX));
  });

  it("lets a per-level color override win for a custom scale", () => {
    const levels = [
      { label: "a", value: 1 },
      { label: "b", value: 2, color: "#123456" },
      { label: "c", value: 3 },
    ];
    const out = resolveScaleColors({ levels });
    expect(out[1]).toBe("#123456");
    expect(out[0]).toMatch(HEX);
    expect(out[2]).toMatch(HEX);
    expect(out[0]).not.toBe("#123456");
  });
});

describe("readableTextOn", () => {
  it("picks white text on a dark background", () => {
    expect(readableTextOn("#000000")).toBe("#fff");
  });
  it("picks dark text on a light background", () => {
    expect(readableTextOn("#ffffff")).toBe("#080A0E");
  });
});
