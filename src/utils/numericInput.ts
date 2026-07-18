// The shared "raw text field -> stored numeric value" rule used by every
// numeric metric input (health named fields, and the performance/competition
// `metrics` maps). Centralized so the four setters that once inlined it stay
// in lockstep.
//
// Returns:
//   undefined - an empty field: clear the stored value.
//   a number  - a finite parse (including 0 and negatives): store it verbatim.
//   null      - a non-finite parse (mid-typed input like "-", "1e", or "abc"):
//               ignore the keystroke and leave the stored value untouched.
export function parseNumericInput(raw: string): number | null | undefined {
  if (raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return value;
}
