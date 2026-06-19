// Helpers for detecting and resolving custom-metric name collisions.
// Kept free of React and registry imports so the collision rules can be
// unit-tested in isolation; callers build the `taken` set of normalized
// names from whatever registries + custom defs are in scope.

/**
 * Canonical form for "are these the same name": trimmed, internal runs of
 * whitespace collapsed to a single space, and lowercased — so "Lap  Time"
 * and "Lap Time" are treated as the same name.
 */
export function normalizeMetricName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// Matches a trailing " (n)" suffix so a desired name that already carries
// one resolves off its base rather than stacking ("Hydration (2)" -> base
// "Hydration", not "Hydration (2) (2)").
const TRAILING_SUFFIX = /\s*\(\d+\)\s*$/;

/**
 * Returns a unique display name derived from `desired` by appending the
 * smallest ` (k)` (k >= 2) whose normalized form is not in `taken`.
 * `taken` holds already-normalized names. The typed casing of the base is
 * preserved in the result.
 */
export function suggestUniqueName(desired: string, taken: Set<string>): string {
  // Collapse internal whitespace to match normalizeMetricName's canonical
  // form (casing preserved here, unlike normalize). Without this, a desired
  // name with a double space ("Lap  Time") would yield a suggestion that
  // carries that double space ("Lap  Time (2)") and get persisted as a
  // non-canonical display name even though it dedups against the collapsed
  // form.
  const base = desired.trim().replace(/\s+/g, " ").replace(TRAILING_SUFFIX, "");
  for (let k = 2; ; k++) {
    // Omit the leading space when the base is empty (e.g. the desired
    // name was only a numeric suffix like "(2)"), so the candidate
    // survives the form's submit-time trim without re-colliding.
    const candidate = base ? `${base} (${k})` : `(${k})`;
    if (!taken.has(normalizeMetricName(candidate))) {
      return candidate;
    }
  }
}
