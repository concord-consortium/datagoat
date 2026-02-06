import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { OutcomeEntry, MetricEntry } from "../types/entries";
import {
  getDocWithMigration,
  setDocWithVersion,
  userDocRef,
} from "./firestore";

const ENTRY_VERSION = 1;

export async function getOutcomeEntry(
  userId: string,
  date: string,
): Promise<OutcomeEntry | null> {
  const ref = userDocRef(userId, "outcomeEntries", date);
  return getDocWithMigration<OutcomeEntry>("outcomeEntry", ref);
}

export async function saveOutcomeMetric(
  userId: string,
  date: string,
  metricId: string,
  value: number,
  tags?: string[],
): Promise<void> {
  const ref = userDocRef(userId, "outcomeEntries", date);
  const existing = await getOutcomeEntry(userId, date);

  const entry: MetricEntry = {
    value,
    ...(tags && tags.length > 0 ? { tags } : {}),
    updatedAt: Timestamp.now(),
  };

  if (existing) {
    const metrics = { ...existing.metrics, [metricId]: entry };
    await setDocWithVersion(ref, { date, metrics }, ENTRY_VERSION);
  } else {
    await setDocWithVersion(
      ref,
      { date, metrics: { [metricId]: entry } },
      ENTRY_VERSION,
    );
  }
}

export async function deleteOutcomeMetric(
  userId: string,
  date: string,
  metricId: string,
): Promise<void> {
  const existing = await getOutcomeEntry(userId, date);
  if (!existing) return;

  const metrics = { ...existing.metrics };
  delete metrics[metricId];

  const ref = userDocRef(userId, "outcomeEntries", date);
  await setDocWithVersion(ref, { date, metrics }, ENTRY_VERSION);
}

export async function getRecentOutcomeEntries(
  userId: string,
  days: number = 30,
): Promise<OutcomeEntry[]> {
  const ref = collection(db, "users", userId, "outcomeEntries");
  const q = query(ref, orderBy("date", "desc"), limit(days));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), date: d.id }) as OutcomeEntry);
}

export function computeTotals(
  entries: OutcomeEntry[],
  metricId: string,
): number {
  return entries.reduce((sum, entry) => {
    const val = entry.metrics[metricId]?.value;
    return sum + (val ?? 0);
  }, 0);
}
