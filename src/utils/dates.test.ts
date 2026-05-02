import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import {
  HISTORY,
  dateAtOffset,
  historyOffsetFromISO,
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

  it("historyOffsetFromISO round-trips for every valid offset", () => {
    for (let n = 0; n <= HISTORY; n++) {
      const iso = toISO(dateAtOffset(n));
      expect(historyOffsetFromISO(iso)).toBe(n);
    }
  });

  it("historyOffsetFromISO returns NaN for malformed input", () => {
    expect(Number.isNaN(historyOffsetFromISO("garbage"))).toBe(true);
    expect(Number.isNaN(historyOffsetFromISO("2026-13-01"))).toBe(true);
    expect(Number.isNaN(historyOffsetFromISO("2026-02-30"))).toBe(true);
    expect(Number.isNaN(historyOffsetFromISO(""))).toBe(true);
  });

  it("historyOffsetFromISO returns NaN for dates outside the window", () => {
    const future = new Date();
    future.setHours(0, 0, 0, 0);
    future.setDate(future.getDate() + 5);
    expect(Number.isNaN(historyOffsetFromISO(toISO(future)))).toBe(true);

    const tooOld = new Date();
    tooOld.setHours(0, 0, 0, 0);
    tooOld.setDate(tooOld.getDate() - (HISTORY + 5));
    expect(Number.isNaN(historyOffsetFromISO(toISO(tooOld)))).toBe(true);
  });

  it("fmtDate / shortFmt produce non-empty strings", () => {
    const d = new Date(2026, 3, 15); // Wed, April 15, 2026
    expect(fmtDate(d)).toBe("Wed, April 15, 2026");
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

// Local-midnight to local-midnight is 23h on spring-forward and 25h on
// fall-back, so daysAgoFromISO leans on Math.round to land on whole days.
// These tests pin the system clock and the TZ to a US DST-observing zone so
// CI (typically UTC) actually exercises the rounding.
declare const process: { env: { TZ?: string } };

describe("daysAgoFromISO across DST boundaries", () => {
  const originalTZ = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });

  afterAll(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("spring-forward: yesterday === 1 when the local-midnight gap is 23h", () => {
    // US DST 2026 starts 02:00 Sun Mar 8, so Mar 8 -> Mar 9 spans 23h.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 9, 12, 0, 0));
    expect(daysAgoFromISO("2026-03-08")).toBe(1);
  });

  it("fall-back: yesterday === 1 when the local-midnight gap is 25h", () => {
    // US DST 2026 ends 02:00 Sun Nov 1, so Nov 1 -> Nov 2 spans 25h.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 2, 12, 0, 0));
    expect(daysAgoFromISO("2026-11-01")).toBe(1);
  });
});
