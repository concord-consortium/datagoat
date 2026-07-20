import type { HealthEntry } from "../types/data";

export type ChipState = "all" | "some" | "none";

// Per spec: "All" = every tracked metric has a non-empty value;
// "Some" = at least one has a value; "None" = all empty.
//
// trackedMetricIds is the caller's currently-tracked metric ids
// (e.g., ["hydration", "sleepTime", ...]). Metrics not in the tracked
// list are skipped entirely from completeness.
//
// Chip state from an arbitrary set of metric ids and a "is this one filled"
// predicate. Entry-shape agnostic, so a page spanning health named fields,
// performance maps, and competition maps can share one chip.
export function getChipStateBy(
  trackedMetricIds: string[],
  isFilled: (id: string) => boolean,
): ChipState {
  if (trackedMetricIds.length === 0) return "none";
  let filledCount = 0;
  for (const id of trackedMetricIds) {
    if (isFilled(id)) filledCount++;
  }
  if (filledCount === 0) return "none";
  if (filledCount === trackedMetricIds.length) return "all";
  return "some";
}

// Health-only convenience wrapper. Kept because the activity calendar and
// the dashboard's per-day "was this logged" probe are health-scoped by
// design, not by omission.
export function getChipState(
  entry: HealthEntry | null,
  trackedMetricIds: string[],
): ChipState {
  return getChipStateBy(trackedMetricIds, (id) => isHealthFieldFilled(entry, id));
}

// Availability counts as filled iff practiceHeld is answered AND
// (practiceHeld === false OR practiceParticipation is answered) - the
// tree must be answered to its leaves to count. Same rule for game.
// "Answered" means typeof === "boolean"; absent / undefined means
// "not answered."
export function isHealthFieldFilled(entry: HealthEntry | null, id: string): boolean {
  if (!entry) return false;
  switch (id) {
    case "hydration":
      return typeof entry.hydration === "number" && Number.isFinite(entry.hydration);
    case "sleepTime":
      return typeof entry.sleepTime === "number" && Number.isFinite(entry.sleepTime);
    case "sleepEfficiency":
      return (
        typeof entry.sleepEfficiency === "number" &&
        Number.isFinite(entry.sleepEfficiency)
      );
    case "protein":
      return typeof entry.protein === "number" && Number.isFinite(entry.protein);
    case "leanMass":
      return typeof entry.leanMass === "number" && Number.isFinite(entry.leanMass);
    case "availability":
      return availabilityFilled(entry);
    default: {
      // Custom metric: a finite number (including 0 and negatives)
      // or a non-empty string counts as filled. A missing / undefined
      // key means "not logged."
      const v = entry.customMetrics?.[id];
      if (typeof v === "number") return Number.isFinite(v);
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
