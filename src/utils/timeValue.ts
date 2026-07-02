export type TimeUnit = "h" | "m" | "s";
export interface TimeLayout {
  coarsest: TimeUnit;
  precision: TimeUnit;
}
export interface TimeFields {
  h?: string;
  m?: string;
  s?: string;
}

// Ordering: coarser units have a smaller rank. h(0) > m(1) > s(2).
const RANK: Record<TimeUnit, number> = { h: 0, m: 1, s: 2 };
const SEC_PER: Record<TimeUnit, number> = { h: 3600, m: 60, s: 1 };

// Map a free-form unit string to a canonical time unit. Tolerates a rate
// suffix ("hr/night") by reading the leading token. Returns null for a
// non-time unit ("kg", "%", "", undefined).
export function normalizeTimeUnit(unit: string | undefined): TimeUnit | null {
  if (!unit) return null;
  const token = unit.trim().toLowerCase().split(/[^a-z]/)[0];
  if (["h", "hr", "hour", "hours"].includes(token)) return "h";
  if (["m", "min", "minute", "minutes"].includes(token)) return "m";
  if (["s", "sec", "second", "seconds"].includes(token)) return "s";
  return null;
}

// Resolve a metric-like object to a layout. Prefers displayUnit ("hr")
// over unit ("hr/night"). Null when the metric is not a time metric
// (no timePrecision), its unit is unmappable, or precision is coarser
// than the unit.
export function resolveTimeLayout(meta: {
  unit?: string;
  displayUnit?: string;
  timePrecision?: TimeUnit;
}): TimeLayout | null {
  if (!meta.timePrecision) return null;
  const coarsest = normalizeTimeUnit(meta.displayUnit ?? meta.unit);
  if (!coarsest) return null;
  if (RANK[meta.timePrecision] < RANK[coarsest]) return null; // precision coarser than unit
  return { coarsest, precision: meta.timePrecision };
}

// The units a layout renders, coarsest -> precision inclusive.
export function layoutUnits(layout: TimeLayout): TimeUnit[] {
  return (["h", "m", "s"] as TimeUnit[]).filter(
    (u) => RANK[u] >= RANK[layout.coarsest] && RANK[u] <= RANK[layout.precision],
  );
}

function fieldOf(fields: TimeFields, unit: TimeUnit): string {
  return (fields[unit] ?? "").trim();
}

export function isAllEmpty(fields: TimeFields, layout: TimeLayout): boolean {
  return layoutUnits(layout).every((u) => fieldOf(fields, u) === "");
}

// Parse the sub-fields into a decimal in the coarsest unit. Returns null
// for an all-empty entry OR any invalid/ambiguous combination (the
// caller distinguishes empty via isAllEmpty).
export function parseTimeToDecimal(
  fields: TimeFields,
  layout: TimeLayout,
): number | null {
  const units = layoutUnits(layout);
  if (isAllEmpty(fields, layout)) return null;

  let totalSeconds = 0;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const raw = fieldOf(fields, unit);
    const isCoarsest = i === 0;
    const isFinest = i === units.length - 1;
    const isSeconds = unit === "s";
    const allowDecimal = isCoarsest || isSeconds;

    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) return null;

    const hasFraction = !Number.isInteger(value);
    if (hasFraction && !allowDecimal) return null; // integer-only mid field
    // Ambiguous: a decimal in a non-finest field while a finer field is set.
    if (hasFraction && !isFinest) {
      const anyFinerSet = units.slice(i + 1).some((u) => fieldOf(fields, u) !== "");
      if (anyFinerSet) return null;
    }
    // Range: non-coarsest minutes are 0-59 integers; non-coarsest seconds are [0,60).
    if (!isCoarsest) {
      if (unit === "m" && (!Number.isInteger(value) || value > 59)) return null;
      if (unit === "s" && value >= 60) return null;
    }
    totalSeconds += value * SEC_PER[unit];
  }
  return totalSeconds / SEC_PER[layout.coarsest];
}

// Round a total-seconds amount to the layout's finest granularity, so the
// subsequent floor-decompose never needs a 59->60 carry.
function roundedTotalSeconds(
  value: number,
  layout: TimeLayout,
  secondsDecimals: number,
): number {
  const totalSeconds = value * SEC_PER[layout.coarsest];
  if (layout.precision === "s") {
    const f = Math.pow(10, secondsDecimals);
    return Math.round(totalSeconds * f) / f;
  }
  const step = SEC_PER[layout.precision]; // 3600 (h) or 60 (m)
  return Math.round(totalSeconds / step) * step;
}

function decompose(
  value: number,
  layout: TimeLayout,
  secondsDecimals: number,
): Record<TimeUnit, number> {
  const units = layoutUnits(layout);
  let rem = roundedTotalSeconds(value, layout, secondsDecimals);
  const out = {} as Record<TimeUnit, number>;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const secPer = SEC_PER[unit];
    if (i < units.length - 1) {
      const q = Math.floor(rem / secPer);
      out[unit] = q;
      rem -= q * secPer;
    } else {
      // finest: exact remainder (already rounded to this granularity)
      out[unit] =
        unit === "s"
          ? Number((rem / secPer).toFixed(secondsDecimals))
          : Math.round(rem / secPer);
    }
  }
  return out;
}

// Split a stored decimal into display fields (blur normalization seed).
export function formatDecimalToFields(
  value: number,
  layout: TimeLayout,
  secondsDecimals: number = 2,
): TimeFields {
  const parts = decompose(value, layout, secondsDecimals);
  const fields: TimeFields = {};
  for (const unit of layoutUnits(layout)) fields[unit] = String(parts[unit]);
  return fields;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Render a stored decimal as a time string. Finer fields are zero-padded;
// the coarsest is not. A seconds-only layout renders without a colon.
export function formatDecimalToTime(
  value: number,
  layout: TimeLayout,
  secondsDecimals: number = 2,
): string {
  const units = layoutUnits(layout);
  const parts = decompose(value, layout, secondsDecimals);
  if (units.length === 1) {
    // seconds-only (or a degenerate single field): no padding, no colon
    return String(parts[units[0]]);
  }
  return units
    .map((unit, i) => {
      const v = parts[unit];
      if (i === 0) return String(v);
      if (unit === "s") {
        const whole = Math.floor(v);
        const frac = v - whole;
        return frac > 0 ? `${pad2(whole)}${v.toFixed(secondsDecimals).slice(String(whole).length)}` : pad2(whole);
      }
      return pad2(v);
    })
    .join(":");
}
