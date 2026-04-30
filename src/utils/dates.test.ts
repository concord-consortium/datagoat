import { describe, it, expect } from "vitest";
import {
  HISTORY,
  dateAtOffset,
  dateOffsetFromISO,
  daysAgoFromISO,
  isoAtDaysAgo,
  toISO,
  shortFmt,
  fmtDate,
} from "./dates";

describe("date helpers", () => {
  it("offset HISTORY === today", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(dateAtOffset(HISTORY).getTime()).toBe(today.getTime());
  });

  it("offset 0 === HISTORY days ago", () => {
    const expected = new Date();
    expected.setHours(0, 0, 0, 0);
    expected.setDate(expected.getDate() - HISTORY);
    expect(dateAtOffset(0).getTime()).toBe(expected.getTime());
  });

  it("toISO formats YYYY-MM-DD with zero padding", () => {
    const d = new Date(2026, 0, 5); // Jan 5, 2026
    expect(toISO(d)).toBe("2026-01-05");
  });

  it("dateOffsetFromISO round-trips for every valid offset", () => {
    for (let n = 0; n <= HISTORY; n++) {
      const iso = toISO(dateAtOffset(n));
      expect(dateOffsetFromISO(iso)).toBe(n);
    }
  });

  it("dateOffsetFromISO returns NaN for malformed input", () => {
    expect(Number.isNaN(dateOffsetFromISO("garbage"))).toBe(true);
    expect(Number.isNaN(dateOffsetFromISO("2026-13-01"))).toBe(true);
    expect(Number.isNaN(dateOffsetFromISO("2026-02-30"))).toBe(true);
    expect(Number.isNaN(dateOffsetFromISO(""))).toBe(true);
  });

  it("dateOffsetFromISO returns NaN for dates outside the window", () => {
    const future = new Date();
    future.setHours(0, 0, 0, 0);
    future.setDate(future.getDate() + 5);
    expect(Number.isNaN(dateOffsetFromISO(toISO(future)))).toBe(true);

    const tooOld = new Date();
    tooOld.setHours(0, 0, 0, 0);
    tooOld.setDate(tooOld.getDate() - (HISTORY + 5));
    expect(Number.isNaN(dateOffsetFromISO(toISO(tooOld)))).toBe(true);
  });

  it("fmtDate / shortFmt produce non-empty strings", () => {
    const d = new Date(2026, 3, 15); // Wed, April 15, 2026
    expect(fmtDate(d)).toMatch(/April 15, 2026$/);
    expect(shortFmt(d)).toBe("4/15/2026");
  });

  it("daysAgoFromISO returns 0 for today, increasing as dates get older", () => {
    expect(daysAgoFromISO(isoAtDaysAgo(0))).toBe(0);
    expect(daysAgoFromISO(isoAtDaysAgo(1))).toBe(1);
    expect(daysAgoFromISO(isoAtDaysAgo(HISTORY))).toBe(HISTORY);
    // Crucially, dates older than HISTORY are NOT clamped - the chart's
    // 6mo / All ranges depend on this.
    expect(daysAgoFromISO(isoAtDaysAgo(180))).toBe(180);
    expect(daysAgoFromISO(isoAtDaysAgo(365))).toBe(365);
  });

  it("daysAgoFromISO returns NaN for malformed input", () => {
    expect(Number.isNaN(daysAgoFromISO("garbage"))).toBe(true);
    expect(Number.isNaN(daysAgoFromISO("2026-13-01"))).toBe(true);
    expect(Number.isNaN(daysAgoFromISO("2026-02-30"))).toBe(true);
    expect(Number.isNaN(daysAgoFromISO(""))).toBe(true);
  });

  it("daysAgoFromISO returns NaN for future dates", () => {
    const future = new Date();
    future.setHours(0, 0, 0, 0);
    future.setDate(future.getDate() + 5);
    expect(Number.isNaN(daysAgoFromISO(toISO(future)))).toBe(true);
  });

  it("isoAtDaysAgo round-trips with daysAgoFromISO", () => {
    for (const n of [0, 1, 7, 29, 90, 180, 365]) {
      expect(daysAgoFromISO(isoAtDaysAgo(n))).toBe(n);
    }
  });
});
