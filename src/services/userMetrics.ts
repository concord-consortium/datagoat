import type { UserMetricConfig, CustomMetric } from "../types/metrics";
import {
  getDocWithMigration,
  setDocWithVersion,
  userDocRef,
} from "./firestore";
import { setDoc, doc, collection } from "firebase/firestore";
import { db } from "./firebase";

const CONFIG_VERSION = 1;

export async function getUserDailyMetrics(
  userId: string,
): Promise<UserMetricConfig | null> {
  const ref = userDocRef(userId, "config", "dailyMetrics");
  return getDocWithMigration<UserMetricConfig>("userMetricConfig", ref);
}

export async function saveUserDailyMetrics(
  userId: string,
  selectedMetricIds: string[],
): Promise<void> {
  const ref = userDocRef(userId, "config", "dailyMetrics");
  await setDocWithVersion(ref, { selectedMetricIds }, CONFIG_VERSION);
}

export async function getUserOutcomeMetrics(
  userId: string,
): Promise<UserMetricConfig | null> {
  const ref = userDocRef(userId, "config", "outcomeMetrics");
  return getDocWithMigration<UserMetricConfig>("userMetricConfig", ref);
}

export async function saveUserOutcomeMetrics(
  userId: string,
  selectedMetricIds: string[],
): Promise<void> {
  const ref = userDocRef(userId, "config", "outcomeMetrics");
  await setDocWithVersion(ref, { selectedMetricIds }, CONFIG_VERSION);
}

export async function saveCustomMetric(
  userId: string,
  metric: Omit<CustomMetric, "schemaVersion">,
): Promise<void> {
  const ref = doc(
    collection(db, "users", userId, "customMetrics"),
    metric.id,
  );
  await setDoc(ref, { ...metric, schemaVersion: CONFIG_VERSION });
}
