import type { Timestamp } from "firebase/firestore";

export interface BadgeDefinition {
  id: string;
  name: string;
  type: "streak" | "threshold" | "complete-entry";
  metric?: string;
  threshold?: number;
  window?: number;
  streakDays?: number;
  messageTemplate: string;
  schemaVersion: number;
}

export interface EarnedBadge {
  badgeId: string;
  earnedAt: Timestamp;
  schemaVersion: number;
}
