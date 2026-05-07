#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

console.error("Running npm run build...");
execSync("npm run build", { cwd: ROOT, stdio: "inherit" });

const sw = readFileSync(join(DIST, "sw.js"), "utf8");
const precacheFiles = [...sw.matchAll(/\{url:"([^"]+)",revision:/g)].map((m) => m[1]);
if (precacheFiles.length === 0) {
  console.error("error: could not parse precache manifest from dist/sw.js");
  process.exit(1);
}

const initialJs = precacheFiles.find((f) => /^assets\/index-[^/]+\.js$/.test(f));
if (!initialJs) {
  console.error("error: could not find assets/index-*.js in precache manifest");
  process.exit(1);
}

function sizes(absPath) {
  const buf = readFileSync(absPath);
  return {
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  };
}

const fmt = (n) => `${(n / 1024).toFixed(1)} KB`;

const initial = sizes(join(DIST, initialJs));
let precacheGzip = 0;
let precacheBrotli = 0;
for (const file of precacheFiles) {
  const s = sizes(join(DIST, file));
  precacheGzip += s.gzip;
  precacheBrotli += s.brotli;
}

console.log("");
console.log("| Artifact | gzip -9 | brotli -q 11 |");
console.log("|---|---|---|");
console.log(`| Initial JS (\`${initialJs}\`) | ${fmt(initial.gzip)} | ${fmt(initial.brotli)} |`);
console.log(`| Precache total (${precacheFiles.length} files) | ${fmt(precacheGzip)} | ${fmt(precacheBrotli)} |`);
console.log("");
console.log("Soft budget: initial JS <= 250 KB gzip, precache <= 500 KB gzip.");
