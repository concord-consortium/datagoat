// Ported from the prototype's date helpers (HISTORY = 29, dateAtOffset, fmtDate,
// shortFmt). HISTORY is the count of past days tracked: offsets 0 through
// HISTORY span 30 days, with offset HISTORY === today.
export const HISTORY = 29;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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
export function dateOffsetFromISO(iso: string): number {
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
  const offset = HISTORY - diffDays;
  if (offset < 0 || offset > HISTORY) return NaN;
  return offset;
}
