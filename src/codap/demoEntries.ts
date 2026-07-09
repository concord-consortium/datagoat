// Synthetic entry generator for demo mode (?demo). Produces real
// HealthEntry / PerformanceEntry / CompetitionEntry objects so the CODAP
// export's resolveTrackedMetrics + buildDataset run unchanged - the demo
// path exercises the same transform as real Firestore data. Values come
// from the same per-metric random generators the dashboard charts use
// (getMetricChartConfig().random), seeded per (seed, category, metricId,
// day) so a fixed seed is reproducible. A ~20% null rate leaves fields
// absent, which the export renders as empty cells.
//
// Metric sources: health = HEALTH_METRICS, competition = COMPETITION_METRICS
// (both default-on). Performance sources from ADDABLE_PERFORMANCE because its
// own registry (PERFORMANCE_METRICS) is empty by design. ADDABLE_HEALTH and
// ADDABLE_COMPETITION are intentionally NOT used: their ids have no chart
// config, so getMetricChartConfig would fall back to DEFAULT_CONFIG (0..100)
// and emit nonsense values and mismatched ordinal labels.
import { ADDABLE_PERFORMANCE } from "../metrics/addableMetrics";
import { COMPETITION_METRICS } from "../metrics/competitionMetrics";
import { HEALTH_METRICS } from "../metrics/healthMetrics";
import { getMetricChartConfig } from "../charts/metricChartConfig";
import { hashSeed, seededRng } from "../charts/randomValues";
import { CURRENT_COMPETITION_ENTRY_VERSION } from "../migrations/competitionEntry";
import { CURRENT_HEALTH_ENTRY_VERSION } from "../migrations/healthEntry";
import { CURRENT_PERFORMANCE_ENTRY_VERSION } from "../migrations/performanceEntry";
import type {
  CompetitionEntry,
  HealthEntry,
  PerformanceEntry,
} from "../types/data";
import { isoAtDaysAgo } from "../utils/dates";

// Default number of daily demo entries per dataset.
export const DEMO_DAYS = 30;

// Matches useChartSeries.DEMO_NULL_RATE: fraction of fields left absent.
const DEMO_NULL_RATE = 0.2;

// Session seed: stable within a page load, varies between loads. Mixed
// into every per-field seed so demo data differs each time the plugin is
// opened (mirrors the chart demo path). Tests pass an explicit seed.
const SESSION_SEED = Math.floor(Math.random() * 0xffffffff);

// The five HealthEntry fields that are typed numeric slots (everything
// else on a health entry - mood, relativeProteinIntake, custom metrics -
// lives in the customMetrics bag, matching readHealthField).
// Single source list for the 5 typed numeric health fields; the union
// type and the runtime lookup set both derive from it so they cannot drift.
const NUMERIC_HEALTH_FIELD_IDS = [
  "hydration",
  "sleepTime",
  "sleepEfficiency",
  "protein",
  "leanMass",
] as const;
type NumericHealthField = (typeof NUMERIC_HEALTH_FIELD_IDS)[number];
const NUMERIC_HEALTH_FIELDS = new Set<string>(NUMERIC_HEALTH_FIELD_IDS);

function rngFor(seed: number, category: string, metricId: string, day: number) {
  return seededRng(hashSeed(`${seed}:${category}:${metricId}:${day}`));
}

function randomAvailability(
  rng: () => number,
): HealthEntry["availability"] {
  // ~20% "not answered" (empty tree), matching the null rate for scalars.
  if (rng() < DEMO_NULL_RATE) return {};
  const practiceHeld = rng() < 0.7;
  const gameHeld = rng() < 0.4;
  const tree: HealthEntry["availability"] = { practiceHeld, gameHeld };
  if (practiceHeld) tree.practiceParticipation = rng() < 0.85;
  if (gameHeld) tree.gameParticipation = rng() < 0.85;
  return tree;
}

export function generateDemoHealthEntries(
  days: number = DEMO_DAYS,
  seed: number = SESSION_SEED,
): HealthEntry[] {
  const out: HealthEntry[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const entry: HealthEntry = {
      version: CURRENT_HEALTH_ENTRY_VERSION,
      date: isoAtDaysAgo(i),
      availability: {},
    };
    const bag: Record<string, number | string> = {};
    for (const m of HEALTH_METRICS) {
      // relativeProteinIntake is auto-calculated (no chart config), so it
      // would fall back to DEFAULT_CONFIG's 0-100 random rather than its
      // real 0.6-3 g/kg range. Skip it in demo rather than emit nonsense.
      if (m.id === "relativeProteinIntake") continue;
      const rng = rngFor(seed, "health", m.id, i);
      if (m.id === "availability") {
        entry.availability = randomAvailability(rng);
        continue;
      }
      if (rng() < DEMO_NULL_RATE) continue; // leave absent
      const value = getMetricChartConfig(m.id).random(rng);
      if (NUMERIC_HEALTH_FIELDS.has(m.id)) {
        entry[m.id as NumericHealthField] = value;
      } else {
        bag[m.id] = value;
      }
    }
    if (Object.keys(bag).length > 0) entry.customMetrics = bag;
    out.push(entry);
  }
  return out;
}

function generateBagEntries(
  metrics: ReadonlyArray<{ id: string }>,
  category: string,
  version: number,
  days: number,
  seed: number,
): Array<{ version: number; date: string; metrics: Record<string, number | string> }> {
  const out: Array<{
    version: number;
    date: string;
    metrics: Record<string, number | string>;
  }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const bag: Record<string, number | string> = {};
    for (const m of metrics) {
      const rng = rngFor(seed, category, m.id, i);
      if (rng() < DEMO_NULL_RATE) continue; // leave absent
      bag[m.id] = getMetricChartConfig(m.id).random(rng);
    }
    out.push({ version, date: isoAtDaysAgo(i), metrics: bag });
  }
  return out;
}

// Sources from ADDABLE_PERFORMANCE, not PERFORMANCE_METRICS: the latter
// is intentionally empty (all performance metrics are default-off). The
// 20 ADDABLE_PERFORMANCE defs are the real built-in performance metrics
// and all have chart configs with `.random`.
export function generateDemoPerformanceEntries(
  days: number = DEMO_DAYS,
  seed: number = SESSION_SEED,
): PerformanceEntry[] {
  return generateBagEntries(
    ADDABLE_PERFORMANCE,
    "performance",
    CURRENT_PERFORMANCE_ENTRY_VERSION,
    days,
    seed,
  );
}

export function generateDemoCompetitionEntries(
  days: number = DEMO_DAYS,
  seed: number = SESSION_SEED,
): CompetitionEntry[] {
  return generateBagEntries(
    COMPETITION_METRICS,
    "competition",
    CURRENT_COMPETITION_ENTRY_VERSION,
    days,
    seed,
  );
}
