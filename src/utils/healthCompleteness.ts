import type { HealthEntry } from "../types/data";

export type ChipState = "all" | "some" | "none";

// Per spec: "All" = every tracked metric has a non-empty value;
// "Some" = at least one has a value; "None" = all empty.
//
// Availability counts as filled iff practiceHeld !== null && (practiceHeld
// === false || practiceParticipation !== null) - the tree must be answered
// to its leaves to count. Same rule for game.
//
// trackedMetricIds is the user's currently-tracked health metric ids
// (e.g., ["hydration", "sleepTime", ...]). Metrics not in the user's
// tracked list are skipped entirely from completeness.
export function getChipState(
  entry: HealthEntry | null,
  trackedMetricIds: string[],
): ChipState {
  if (trackedMetricIds.length === 0) return "none";
  let filledCount = 0;
  for (const id of trackedMetricIds) {
    if (isFieldFilled(entry, id)) filledCount++;
  }
  if (filledCount === 0) return "none";
  if (filledCount === trackedMetricIds.length) return "all";
  return "some";
}

function isFieldFilled(entry: HealthEntry | null, id: string): boolean {
  if (!entry) return false;
  switch (id) {
    case "hydration":
      return typeof entry.hydration === "number" && entry.hydration > 0;
    case "sleepTime":
      return typeof entry.sleepTime === "number" && entry.sleepTime > 0;
    case "sleepEfficiency":
      return (
        typeof entry.sleepEfficiency === "number" && entry.sleepEfficiency > 0
      );
    case "protein":
      return typeof entry.protein === "number" && entry.protein > 0;
    case "leanMass":
      return typeof entry.leanMass === "number" && entry.leanMass > 0;
    case "availability":
      return availabilityFilled(entry);
    default:
      // Unknown metric id - treat as not filled (caller's tracked list
      // includes a metric we don't know about).
      return false;
  }
}

function availabilityFilled(entry: HealthEntry): boolean {
  const a = entry.availability;
  if (!a) return false;
  const practiceFilled =
    a.practiceHeld !== null &&
    (a.practiceHeld === false || a.practiceParticipation !== null);
  const gameFilled =
    a.gameHeld !== null &&
    (a.gameHeld === false || a.gameParticipation !== null);
  return practiceFilled && gameFilled;
}
