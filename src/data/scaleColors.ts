// Color resolution for "scale" (categorical/ordinal) metrics rendered as cards.
//
// Precedence when resolving the per-card colors for a metric:
//   1. A fixed built-in palette keyed by metricId (e.g. mood, hydration). These
//      are author-defined and NOT user-editable.
//   2. Otherwise an auto pale->dark single-hue ramp derived from the level count.
//   3. For custom metrics, a per-level `color` (set in the levels editor) overrides
//      the ramp value for that card.
import { HYDRATION_HEXES } from "./hydrationColors";
import type { CustomMetricLevel } from "../types/customMetrics";

// Default hue for the auto ramp used by custom scales (blue).
const DEFAULT_SCALE_HUE = 205;

// Mood's fixed blue ramp. Per the design mockup the ramp runs
// value 1 (saddest) = darkest -> value 5 (happiest) = lightest.
export const MOOD_HEXES = [
  "#0B3B66", // 1 - darkest
  "#1E5E8C",
  "#3E86B5",
  "#79B6D9",
  "#BFE3F5", // 5 - lightest
];

// Built-in scale metrics with a fixed, non-user-editable palette, keyed by metric id.
// HYDRATION_HEXES stays defined in hydrationColors.ts (single source) and is referenced here.
export const BUILTIN_SCALE_PALETTES: Record<string, string[]> = {
  mood: MOOD_HEXES,
  hydration: HYDRATION_HEXES,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// HSL (h in deg, s/l in %) -> "#rrggbb".
function hslToHex(h: number, s: number, l: number): string {
  const sN = clamp(s, 0, 100) / 100;
  const lN = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = lN - c / 2;
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface RampOptions {
  satPct?: number;
  lightFromPct?: number; // palest (first card)
  lightToPct?: number; // darkest (last card)
}

// A pale->dark single-hue ramp of `count` steps. Index 0 is palest, last is darkest.
export function rampHexes(
  count: number,
  hueDeg: number,
  opts: RampOptions = {},
): string[] {
  const { satPct = 62, lightFromPct = 92, lightToPct = 34 } = opts;
  if (count <= 0) return [];
  if (count === 1) return [hslToHex(hueDeg, satPct, (lightFromPct + lightToPct) / 2)];
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const l = lightFromPct + (lightToPct - lightFromPct) * t;
    return hslToHex(hueDeg, satPct, l);
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const int = parseInt(m[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

// WCAG relative luminance (0 = black .. 1 = white).
export function relativeLuminance(hex: string): number {
  const lin = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

// Legible text color for content sitting on top of `hex`.
export function readableTextOn(hex: string): "#fff" | "#080A0E" {
  return relativeLuminance(hex) < 0.45 ? "#fff" : "#080A0E";
}

interface ResolveArgs {
  metricId?: string;
  levels: CustomMetricLevel[];
  fallbackHueDeg?: number;
}

// Resolve the ordered per-card colors for a scale metric (1:1 with `levels`).
export function resolveScaleColors({
  metricId,
  levels,
  fallbackHueDeg = DEFAULT_SCALE_HUE,
}: ResolveArgs): string[] {
  const n = levels.length;

  // 1. Built-in fixed palette wins outright (not user-editable).
  const builtin = metricId ? BUILTIN_SCALE_PALETTES[metricId] : undefined;
  if (builtin) {
    return Array.from({ length: n }, (_, i) => builtin[i] ?? builtin[builtin.length - 1]);
  }

  // 2. Auto ramp, 3. with per-level overrides applied on top (custom metrics only).
  const ramp = rampHexes(n, fallbackHueDeg);
  return levels.map((level, i) => level.color ?? ramp[i]);
}
