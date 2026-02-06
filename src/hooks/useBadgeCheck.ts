import { useState, useCallback } from "react";
import { checkAndAwardBadges } from "../services/badges";
import { getRecentBodyEntries } from "../services/bodyEntries";
import type { BadgeDefinition } from "../types/badges";

export function useBadgeCheck(
  userId: string | undefined,
  trackedMetricCount: number,
  bodyWeightKg?: number,
) {
  const [newBadges, setNewBadges] = useState<BadgeDefinition[]>([]);

  const runCheck = useCallback(async () => {
    if (!userId) return;
    const entries = await getRecentBodyEntries(userId, 30);
    const earned = await checkAndAwardBadges(
      userId,
      entries,
      trackedMetricCount,
      bodyWeightKg,
    );
    if (earned.length > 0) {
      setNewBadges(earned);
    }
  }, [userId, trackedMetricCount, bodyWeightKg]);

  const dismissBadge = useCallback(() => {
    setNewBadges((prev) => prev.slice(1));
  }, []);

  return { newBadges, runCheck, dismissBadge };
}
