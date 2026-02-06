import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { BodyEntry, MetricEntry } from "../types/entries";
import {
  getDocWithMigration,
  setDocWithVersion,
  userDocRef,
} from "./firestore";

const ENTRY_VERSION = 1;

export async function getBodyEntry(
  userId: string,
  date: string,
): Promise<BodyEntry | null> {
  const ref = userDocRef(userId, "bodyEntries", date);
  return getDocWithMigration<BodyEntry>("bodyEntry", ref);
}

export async function saveBodyMetric(
  userId: string,
  date: string,
  metricId: string,
  value: number,
  tags?: string[],
): Promise<void> {
  const ref = userDocRef(userId, "bodyEntries", date);
  const existing = await getBodyEntry(userId, date);

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

export async function deleteBodyMetric(
  userId: string,
  date: string,
  metricId: string,
): Promise<void> {
  const existing = await getBodyEntry(userId, date);
  if (!existing) return;

  const metrics = { ...existing.metrics };
  delete metrics[metricId];

  const ref = userDocRef(userId, "bodyEntries", date);
  await setDocWithVersion(ref, { date, metrics }, ENTRY_VERSION);
}

export async function getRecentBodyEntries(
  userId: string,
  days: number = 14,
): Promise<BodyEntry[]> {
  const ref = collection(db, "users", userId, "bodyEntries");
  const q = query(ref, orderBy("date", "desc"), limit(days));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), date: d.id }) as BodyEntry);
}
