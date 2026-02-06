import type { BodyEntry } from "../types/entries";

export function calculateStreak(entries: BodyEntry[]): number {
  if (entries.length === 0) return 0;

  const dates = entries
    .filter((e) => Object.keys(e.metrics).length > 0)
    .map((e) => e.date)
    .sort()
    .reverse();

  if (dates.length === 0) return 0;

  let streak = 1;
  for (let i = 0; i < dates.length - 1; i++) {
    const current = new Date(dates[i] + "T00:00:00");
    const prev = new Date(dates[i + 1] + "T00:00:00");
    const diffDays = Math.round(
      (current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

export function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T00:00:00");
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}
