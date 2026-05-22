// Ported verbatim from window._motivationMessages in
// /home/doug/docs/datagoat-2026-04-27.html. {name} substitution happens at
// render time; the prototype's <br> tags are preserved so the carousel breaks
// land where the designer intended.
//
// `iconKey` resolves to a glyph in src/icons/motivation-*.svg (renamed from
// the unnamed icon-{hash}.svg files at Step 13). The prototype renders a
// different SVG per message; `iconKey` is `null` for an iconless message
// (none at present - the prototype's only iconless entry was a spec note
// that leaked into the UI, removed per DGT-60).

export interface MotivationMessage {
  template: string;
  iconKey:
    | "motivation-streak"
    | "motivation-pb"
    | "motivation-comeback"
    | "motivation-pb-clock"
    | "motivation-trophy"
    | "motivation-scoreboard"
    | null;
}

export const MOTIVATION_MESSAGES: MotivationMessage[] = [
  {
    template: "Consistency is key: you’re on a<br>5-day streak! Let’s go, {name}!",
    iconKey: "motivation-streak",
  },
  {
    template: "New personal best, {name}!<br>Keep pushing your limits.",
    iconKey: "motivation-pb",
  },
  {
    template: "{name}, glad to see you back.<br>Every step forward counts!",
    iconKey: "motivation-comeback",
  },
  {
    template: "New personal best!<br>Keep pushing your limits.",
    iconKey: "motivation-pb-clock",
  },
  {
    // Em-dash from prototype designer copy replaced with hyphen per the
    // project-wide CLAUDE.md "No em dashes - use regular hyphens" rule.
    template: "Big win, {name} - your<br>effort showed out there.",
    iconKey: "motivation-trophy",
  },
  {
    template: "You got on the scoreboard<br>this week. Nice job, {name}.",
    iconKey: "motivation-scoreboard",
  },
];
