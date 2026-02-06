import {
  collection,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { setDocWithVersion, getDocWithMigration, userDocRef } from "./firestore";
import { calculateStreak } from "./streaks";
import { DEFAULT_BADGES } from "../data/defaultBadges";
import type { BadgeDefinition, EarnedBadge } from "../types/badges";
import type { BodyEntry } from "../types/entries";

const BADGE_VERSION = 1;

export async function getEarnedBadges(userId: string): Promise<EarnedBadge[]> {
  const ref = collection(db, "users", userId, "badges");
  const snap = await getDocs(ref);
  return snap.docs.map((d) => d.data() as EarnedBadge);
}

export async function awardBadge(
  userId: string,
  badgeId: string,
): Promise<void> {
  const ref = userDocRef(userId, "badges", badgeId);
  await setDocWithVersion(
    ref,
    { badgeId, earnedAt: Timestamp.now() },
    BADGE_VERSION,
  );
}

export async function isBadgeEarned(
  userId: string,
  badgeId: string,
): Promise<boolean> {
  const ref = userDocRef(userId, "badges", badgeId);
  const existing = await getDocWithMigration<EarnedBadge>("earnedBadge", ref);
  return existing !== null;
}

export function evaluateBadges(
  entries: BodyEntry[],
  badges: BadgeDefinition[],
  trackedMetricCount: number,
  bodyWeightKg?: number,
): string[] {
  const earned: string[] = [];

  for (const badge of badges) {
    switch (badge.type) {
      case "streak": {
        const streak = calculateStreak(entries);
        if (badge.streakDays && streak >= badge.streakDays) {
          earned.push(badge.id);
        }
        break;
      }

      case "complete-entry": {
        const today = new Date().toISOString().split("T")[0];
        const todayEntry = entries.find((e) => e.date === today);
        if (todayEntry) {
          const loggedCount = Object.keys(todayEntry.metrics).length;
          if (loggedCount >= trackedMetricCount && trackedMetricCount > 0) {
            earned.push(badge.id);
          }
        }
        break;
      }

      case "threshold": {
        if (!badge.metric || badge.threshold === undefined || !badge.window) {
          break;
        }

        const windowEntries = entries
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, badge.window);

        if (windowEntries.length < badge.window) break;

        if (badge.metric === "hydration") {
          // Hydration: all days within window must be at or below threshold (lower is better)
          const allGood = windowEntries.every((e) => {
            const val = e.metrics[badge.metric!]?.value;
            return val !== undefined && val <= badge.threshold!;
          });
          if (allGood) earned.push(badge.id);
        } else if (badge.metric === "availability") {
          // Availability: all days must be 1 (available)
          const allAvailable = windowEntries.every((e) => {
            const val = e.metrics[badge.metric!]?.value;
            return val === 1;
          });
          if (allAvailable) earned.push(badge.id);
        } else if (badge.metric === "protein" && bodyWeightKg) {
          // Protein: average must be >= threshold * bodyweight
          const target = badge.threshold * bodyWeightKg;
          const values = windowEntries
            .map((e) => e.metrics[badge.metric!]?.value)
            .filter((v): v is number => v !== undefined);
          if (values.length === badge.window) {
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            if (avg >= target) earned.push(badge.id);
          }
        } else {
          // Generic threshold: average over window must meet or exceed threshold
          const values = windowEntries
            .map((e) => e.metrics[badge.metric!]?.value)
            .filter((v): v is number => v !== undefined);
          if (values.length === badge.window) {
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            if (avg >= badge.threshold) earned.push(badge.id);
          }
        }
        break;
      }
    }
  }

  return earned;
}

export async function checkAndAwardBadges(
  userId: string,
  entries: BodyEntry[],
  trackedMetricCount: number,
  bodyWeightKg?: number,
): Promise<BadgeDefinition[]> {
  const newlyEarned: BadgeDefinition[] = [];
  const qualifiedIds = evaluateBadges(
    entries,
    DEFAULT_BADGES,
    trackedMetricCount,
    bodyWeightKg,
  );

  for (const badgeId of qualifiedIds) {
    const already = await isBadgeEarned(userId, badgeId);
    if (!already) {
      await awardBadge(userId, badgeId);
      const def = DEFAULT_BADGES.find((b) => b.id === badgeId);
      if (def) newlyEarned.push(def);
    }
  }

  return newlyEarned;
}
