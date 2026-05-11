import type { HealthEntry } from "../types/data";

export type ChipState = "all" | "some" | "none";

// Per spec: "All" = every tracked metric has a non-empty value;
// "Some" = at least one has a value; "None" = all empty.
//
// Availability counts as filled iff practiceHeld is answered AND
// (practiceHeld === false OR practiceParticipation is answered) - the
// tree must be answered to its leaves to count. Same rule for game.
// "Answered" means typeof === "boolean"; absent / undefined means
// "not answered."
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
    default: {
      // Custom metric: read from entry.customMetrics. A non-zero number
      // (incl. negatives for customs with yBottomRaw < 0) or a non-empty
      // string counts as filled — matches the !== 0 sentinel rule used
      // by Dashboard.competitionLoggedAny and CompetitionLog stringValue.
      const v = entry.customMetrics?.[id];
      if (typeof v === "number") return v !== 0;
      if (typeof v === "string") return v.trim() !== "";
      return false;
    }
  }
}

function availabilityFilled(entry: HealthEntry): boolean {
  const a = entry.availability;
  if (!a) return false;
  const practiceFilled =
    typeof a.practiceHeld === "boolean" &&
    (a.practiceHeld === false || typeof a.practiceParticipation === "boolean");
  const gameFilled =
    typeof a.gameHeld === "boolean" &&
    (a.gameHeld === false || typeof a.gameParticipation === "boolean");
  return practiceFilled && gameFilled;
}
