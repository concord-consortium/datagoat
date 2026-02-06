import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import type { MetricDefinition, SportDefaults } from "../types/metrics";
import { ALL_METRICS } from "../data/defaultMetrics";
import { SPORT_DEFAULTS } from "../data/sportDefaults";
import type { Sport } from "../types/profile";

export async function getMetricDefinitions(): Promise<MetricDefinition[]> {
  try {
    const snap = await getDocs(collection(db, "config", "metrics", "items"));
    if (snap.empty) return ALL_METRICS;
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as MetricDefinition);
  } catch {
    return ALL_METRICS;
  }
}

export async function getSportDefaults(sport: Sport): Promise<SportDefaults> {
  try {
    const snap = await getDocs(collection(db, "config", "sports", "items"));
    const match = snap.docs.find((d) => d.data().sport === sport);
    if (match) return match.data() as SportDefaults;
  } catch {
    // fall through to local defaults
  }
  return SPORT_DEFAULTS.find((s) => s.sport === sport) ?? SPORT_DEFAULTS[0];
}

export function getMetricById(
  metrics: MetricDefinition[],
  id: string,
): MetricDefinition | undefined {
  return metrics.find((m) => m.id === id);
}
