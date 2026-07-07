import { describe, it, expect } from "vitest";
import {
  normalizeTimeUnit,
  resolveTimeLayout,
  parseTimeToDecimal,
  parseClockString,
  hasTimeRangeError,
  formatDecimalToFields,
  formatDecimalToTime,
  isAllEmpty,
  type TimeLayout,
} from "./timeValue";

const HMM: TimeLayout = { coarsest: "h", precision: "m" };       // sleep
const MSS: TimeLayout = { coarsest: "m", precision: "s" };       // mile
const HMS: TimeLayout = { coarsest: "h", precision: "s" };       // marathon
const SEC: TimeLayout = { coarsest: "s", precision: "s" };       // sprint

describe("normalizeTimeUnit", () => {
  it("maps hour/minute/second spellings", () => {
    expect(normalizeTimeUnit("hr")).toBe("h");
    expect(normalizeTimeUnit("hr/night")).toBe("h");
    expect(normalizeTimeUnit("hour")).toBe("h");
    expect(normalizeTimeUnit("min")).toBe("m");
    expect(normalizeTimeUnit("sec")).toBe("s");
    expect(normalizeTimeUnit("s")).toBe("s");
  });
  it("returns null for non-time units", () => {
    expect(normalizeTimeUnit("kg")).toBeNull();
    expect(normalizeTimeUnit(undefined)).toBeNull();
    expect(normalizeTimeUnit("")).toBeNull();
  });
});

describe("resolveTimeLayout", () => {
  it("derives coarsest from displayUnit, precision from timePrecision", () => {
    expect(
      resolveTimeLayout({ unit: "hr/night", displayUnit: "hr", timePrecision: "m" }),
    ).toEqual(HMM);
    expect(resolveTimeLayout({ unit: "min", timePrecision: "s" })).toEqual(MSS);
    expect(resolveTimeLayout({ unit: "sec", timePrecision: "s" })).toEqual(SEC);
  });
  it("is null without timePrecision or with an unmappable/inverted unit", () => {
    expect(resolveTimeLayout({ unit: "hr" })).toBeNull();
    expect(resolveTimeLayout({ unit: "kg", timePrecision: "s" })).toBeNull();
    // precision coarser than unit (min unit, hour precision) is invalid
    expect(resolveTimeLayout({ unit: "min", timePrecision: "h" })).toBeNull();
  });
});

describe("parseTimeToDecimal", () => {
  it("combines fields into the coarsest-unit decimal", () => {
    expect(parseTimeToDecimal({ h: "8", m: "30" }, HMM)).toBeCloseTo(8.5, 6);
    expect(parseTimeToDecimal({ m: "5", s: "30" }, MSS)).toBeCloseTo(5.5, 6);
    expect(parseTimeToDecimal({ h: "1", m: "23", s: "45" }, HMS)).toBeCloseTo(
      1 + 23 / 60 + 45 / 3600,
      6,
    );
    expect(parseTimeToDecimal({ s: "36.54" }, SEC)).toBeCloseTo(36.54, 6);
  });
  it("accepts a decimal shorthand in the coarsest field when finer fields are empty", () => {
    expect(parseTimeToDecimal({ h: "8.6", m: "" }, HMM)).toBeCloseTo(8.6, 6);
    expect(parseTimeToDecimal({ m: "5.5", s: "" }, MSS)).toBeCloseTo(5.5, 6);
  });
  it("accepts a decimal in the seconds (finest) field", () => {
    expect(parseTimeToDecimal({ m: "5", s: "30.5" }, MSS)).toBeCloseTo(
      5 + 30.5 / 60,
      6,
    );
  });
  it("rejects a decimal in a non-finest field when a finer field is set (ambiguous)", () => {
    expect(parseTimeToDecimal({ h: "8.5", m: "40" }, HMM)).toBeNull();
    expect(parseTimeToDecimal({ m: "5.5", s: "20" }, MSS)).toBeNull();
  });
  it("rejects a decimal in an integer-only mid field", () => {
    // minutes is neither coarsest nor seconds in h:mm:ss -> integer only
    expect(parseTimeToDecimal({ h: "1", m: "23.5", s: "0" }, HMS)).toBeNull();
  });
  it("enforces 0-59 minutes and [0,60) seconds on non-coarsest fields", () => {
    expect(parseTimeToDecimal({ h: "8", m: "60" }, HMM)).toBeNull();
    expect(parseTimeToDecimal({ m: "5", s: "60" }, MSS)).toBeNull();
    expect(parseTimeToDecimal({ m: "5", s: "59.9" }, MSS)).toBeCloseTo(
      5 + 59.9 / 60,
      6,
    );
  });
  it("allows the coarsest field to exceed 59 (unbounded)", () => {
    expect(parseTimeToDecimal({ m: "150", s: "0" }, MSS)).toBeCloseTo(150, 6);
  });
  it("returns null for all-empty and for garbage", () => {
    expect(parseTimeToDecimal({ h: "", m: "" }, HMM)).toBeNull();
    expect(parseTimeToDecimal({ h: "x", m: "" }, HMM)).toBeNull();
  });
});

describe("isAllEmpty", () => {
  it("is true only when every layout field is blank", () => {
    expect(isAllEmpty({ h: "", m: "" }, HMM)).toBe(true);
    expect(isAllEmpty({ h: "8", m: "" }, HMM)).toBe(false);
  });
});

describe("formatDecimalToFields (blur normalization)", () => {
  it("splits a coarsest decimal into fields", () => {
    expect(formatDecimalToFields(8.5, HMM)).toEqual({ h: "8", m: "30" });
    expect(formatDecimalToFields(8.6, HMM)).toEqual({ h: "8", m: "36" });
    expect(formatDecimalToFields(5.5, MSS, 0)).toEqual({ m: "5", s: "30" });
  });
  it("rounds at the minutes floor for h:mm and carries", () => {
    expect(formatDecimalToFields(8.61, HMM)).toEqual({ h: "8", m: "37" });
    expect(formatDecimalToFields(8.999, HMM)).toEqual({ h: "9", m: "0" });
  });
  it("keeps fractional seconds for a seconds-precision layout", () => {
    expect(formatDecimalToFields(8.615, HMS, 0)).toEqual({ h: "8", m: "36", s: "54" });
    expect(formatDecimalToFields(5 + 30.5 / 60, MSS, 1)).toEqual({ m: "5", s: "30.5" });
  });
});

describe("formatDecimalToTime", () => {
  it("renders each layout, padding finer fields", () => {
    expect(formatDecimalToTime(8.5, HMM)).toBe("8:30");
    expect(formatDecimalToTime(8 + 5 / 60, HMM)).toBe("8:05");
    expect(formatDecimalToTime(5.5, MSS, 0)).toBe("5:30");
    expect(formatDecimalToTime(1 + 23 / 60 + 45 / 3600, HMS, 0)).toBe("1:23:45");
  });
  it("applies secondsDecimals to the seconds component", () => {
    expect(formatDecimalToTime(5 + 3.45 / 60, MSS, 0)).toBe("5:03");
    expect(formatDecimalToTime(5 + 3.45 / 60, MSS, 1)).toBe("5:03.5");
    expect(formatDecimalToTime(5 + 3.45 / 60, MSS, 2)).toBe("5:03.45");
  });
  it("renders a seconds-only layout without a colon", () => {
    expect(formatDecimalToTime(5.3, SEC, 1)).toBe("5.3");
    expect(formatDecimalToTime(5, SEC, 0)).toBe("5");
  });
  it("keeps the configured seconds precision in a seconds-only layout", () => {
    // Trailing zeros must survive: 2.50 must not collapse to "2.5" and
    // 3.00 must not collapse to "3", so sprint times read consistently.
    expect(formatDecimalToTime(2.5, SEC, 2)).toBe("2.50");
    expect(formatDecimalToTime(3, SEC, 2)).toBe("3.00");
  });
});

describe("parseClockString", () => {
  it("right-aligns pieces to the precision unit for composite layouts", () => {
    expect(parseClockString("8:40", MSS)).toBeCloseTo(8 + 40 / 60, 6); // 8m40s
    expect(parseClockString("8:40", HMM)).toBeCloseTo(8 + 40 / 60, 6); // 8h40m
    expect(parseClockString("1:23:45", HMS)).toBeCloseTo(
      1 + 23 / 60 + 45 / 3600,
      6,
    );
  });
  it("reads a stopwatch paste into a seconds-only metric as m:s", () => {
    // "1:30" must become 90 seconds, not silently truncate to 1.
    expect(parseClockString("1:30", SEC)).toBeCloseTo(90, 6);
  });
  it("rejects non-clock strings, over-long pastes, and out-of-range fields", () => {
    expect(parseClockString("90", SEC)).toBeNull(); // no colon
    expect(parseClockString("1:2:3:4", HMS)).toBeNull(); // too many pieces
    expect(parseClockString("1:75", MSS)).toBeNull(); // seconds >= 60
    expect(parseClockString("1:5.5", MSS)).toBeNull(); // fractional non-leading
    expect(parseClockString("1:", MSS)).toBeNull(); // empty piece
  });
});

describe("hasTimeRangeError", () => {
  it("flags an out-of-range non-coarsest field", () => {
    expect(hasTimeRangeError({ m: "5", s: "75" }, MSS)).toBe(true);
    expect(hasTimeRangeError({ h: "8", m: "60" }, HMM)).toBe(true);
  });
  it("does not flag in-range fields or a large coarsest field", () => {
    expect(hasTimeRangeError({ m: "5", s: "45" }, MSS)).toBe(false);
    expect(hasTimeRangeError({ s: "75" }, SEC)).toBe(false); // seconds is coarsest here
  });
});
