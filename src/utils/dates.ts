// Ported from the prototype's date helpers (HISTORY = 29, dateAtOffset, fmtDate,
// shortFmt). HISTORY is the count of past days tracked: offsets 0 through
// HISTORY span 30 days, with offset HISTORY === today.
export const HISTORY = 29;

// Weekday abbreviations indexed by Date.getDay() (0 = Sun … 6 = Sat).
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Returns the local-midnight Date for `offset` within the HISTORY window:
// offset 0 === HISTORY days ago, offset HISTORY === today. Caller must keep
// offset in [0, HISTORY]; values outside that range produce dates outside
// the window (negative offsets go further into the past, offsets > HISTORY
// produce future dates that NaN out daysAgoFromISO downstream). All current
// callers either pass HISTORY directly, loop within [0, HISTORY], or derive
// offset from historyOffsetFromISO which already clamps via NaN.
export function dateAtOffset(offset: number): Date {
  const today = todayMidnight();
  const d = new Date(today);
  d.setDate(today.getDate() - (HISTORY - offset));
  return d;
}

export function fmtDate(d: Date): string {
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function shortFmt(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

export function toISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Inverse of toISO(dateAtOffset(n)). Returns NaN for unparseable input or
// for parsed dates outside [0, HISTORY] so callers can fall back to today.
// Use this only for the HISTORY/DateNav window; for listener-window data
// (LISTENER_WINDOW_DAYS) use daysAgoFromISO, which does not clamp.
export function historyOffsetFromISO(iso: string): number {
  const days = daysAgoFromISO(iso);
  if (Number.isNaN(days)) return NaN;
  const offset = HISTORY - days;
  if (offset < 0 || offset > HISTORY) return NaN;
  return offset;
}

// Days from the given ISO date to today (today === 0, yesterday === 1, ...).
// Returns NaN for unparseable input or future dates. Unlike
// historyOffsetFromISO, this does NOT clamp to HISTORY - chart code that
// renders 3mo / 6mo / All-time windows needs to see older entries.
export function daysAgoFromISO(iso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return NaN;
  const [yStr, mStr, dStr] = iso.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return NaN;
  const parsed = new Date(y, m - 1, d);
  if (
    parsed.getFullYear() !== y ||
    parsed.getMonth() !== m - 1 ||
    parsed.getDate() !== d
  ) {
    return NaN;
  }
  parsed.setHours(0, 0, 0, 0);
  const today = todayMidnight();
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((today.getTime() - parsed.getTime()) / msPerDay);
  if (diffDays < 0) return NaN;
  return diffDays;
}

// ISO string for the date `n` days before today. n=0 → today.
export function isoAtDaysAgo(n: number): string {
  const d = todayMidnight();
  d.setDate(d.getDate() - n);
  return toISO(d);
}
