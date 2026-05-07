#!/usr/bin/env node
// Extract unique inline <svg> glyphs from the designer prototype HTML and
// write each to src/icons/icon-{hash}.svg for hand-renaming to canonical
// kebab-case role names (home.svg, hamburger.svg, etc.).
//
// Run with: node tools/extract-icons.mjs
//
// Why this script vs grep -oE: grep is line-oriented and silently skips
// multi-line SVGs (most of them in this prototype). The dotall pattern
// below ([\s\S]*?) matches across newlines.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const PROTOTYPE_PATH = "/home/doug/docs/datagoat-2026-04-27.html";
const OUT_DIR = path.join(repoRoot, "src", "icons");

const html = readFileSync(PROTOTYPE_PATH, "utf8");
const svgs = [...html.matchAll(/<svg[^>]*>[\s\S]*?<\/svg>/g)].map((m) => m[0]);
const unique = new Map(); // hash -> svg

for (const svg of svgs) {
  const inner = svg.replace(/^<svg[^>]*>|<\/svg>$/g, "").trim();
  const hash = createHash("sha1").update(inner).digest("hex").slice(0, 8);
  if (!unique.has(hash)) unique.set(hash, svg);
}

mkdirSync(OUT_DIR, { recursive: true });

for (const [hash, svg] of unique) {
  // Strip wrapper width/height; svgr forwards props at consumer site.
  const cleaned = svg.replace(/\s+(width|height)="[^"]*"/g, "");
  writeFileSync(path.join(OUT_DIR, `icon-${hash}.svg`), cleaned);
}

console.log(
  `Extracted ${unique.size} unique glyphs from ${svgs.length} <svg> instances.`,
);
console.log(`Wrote to ${OUT_DIR}`);
