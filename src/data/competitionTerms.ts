// Ported from /home/doug/docs/datagoat-2026-04-27.html (around line 7886-7900).
// The prototype attaches a global syncTerm() that swaps `comp-term-text` /
// `comp-term-text-lower` based on the user's profile competitionTerm; the
// abbreviation map below is the canonical short form used in tight
// horizontal contexts (totals headers, etc.).
//
// Add to this map verbatim if the designer ships more abbreviations.
const ABBREVIATIONS: Record<string, string> = {
  tournament: "Tourn.",
};

const TITLE_CASE_FALLBACK: Record<string, string> = {
  bout: "Bout",
  game: "Game",
  match: "Match",
  meet: "Meet",
  race: "Race",
  regatta: "Regatta",
  tournament: "Tournament",
};

// Returns the user-facing label for a competition term (e.g., "Game",
// "Meet"). When `abbreviated` is true, returns the short form ("Tourn.")
// for terms that have one; otherwise falls through to the full label.
export function getCompTermLabel(
  term: string,
  abbreviated: boolean = false,
): string {
  if (!term) return "Game";
  const lower = term.toLowerCase();
  if (abbreviated && ABBREVIATIONS[lower]) {
    return ABBREVIATIONS[lower];
  }
  return TITLE_CASE_FALLBACK[lower] ?? term.charAt(0).toUpperCase() + term.slice(1);
}

// The plural / lowercase variant the prototype renders inside body copy
// ("Did you have practice and/or a {game} today?"). Lowercase, returns the
// raw value so "tournament" stays "tournament" (not "Tournament").
export function getCompTermLowerLabel(term: string): string {
  if (!term) return "game";
  return term.toLowerCase();
}
