// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SCHEDULE,
  resolveSchedule,
  formatSchedule,
  parseStoredSchedule,
  scheduleToFirestore,
  schedulesEqual,
  normalizedDays,
  type MetricSchedule,
} from "./metricSchedule";

describe("resolveSchedule", () => {
  it("falls back to irregular when neither base nor override is set", () => {
    expect(resolveSchedule(undefined, undefined)).toEqual(DEFAULT_SCHEDULE);
    expect(DEFAULT_SCHEDULE.period).toBe("irregular");
  });

  it("returns the base schedule when there is no override", () => {
    const base: MetricSchedule = { period: "daily" };
    expect(resolveSchedule(base, undefined)).toEqual(base);
  });

  it("lets an override fully replace the base", () => {
    const base: MetricSchedule = { period: "daily" };
    const override: MetricSchedule = { period: "weekly", count: 2 };
    expect(resolveSchedule(base, override)).toEqual(override);
  });
});

describe("formatSchedule", () => {
  it("labels a once-per-period schedule by period name", () => {
    expect(formatSchedule({ period: "daily" })).toBe("Daily");
    expect(formatSchedule({ period: "weekly" })).toBe("Weekly");
    expect(formatSchedule({ period: "monthly" })).toBe("Monthly");
    expect(formatSchedule({ period: "yearly" })).toBe("Yearly");
  });

  it("treats an omitted count as once per period", () => {
    expect(formatSchedule({ period: "weekly", count: 1 })).toBe("Weekly");
  });

  it("prefixes a multiple count with the capitalized period label", () => {
    expect(formatSchedule({ period: "daily", count: 3 })).toBe("3× Daily");
    expect(formatSchedule({ period: "weekly", count: 2 })).toBe("2× Weekly");
    expect(formatSchedule({ period: "yearly", count: 2 })).toBe("2× Yearly");
  });

  it("labels irregular regardless of count", () => {
    expect(formatSchedule({ period: "irregular" })).toBe("Irregular");
    expect(formatSchedule({ period: "irregular", count: 5 })).toBe("Irregular");
  });

  it("treats a non-positive-integer count as once per period", () => {
    expect(formatSchedule({ period: "daily", count: 2.5 })).toBe("Daily");
    expect(formatSchedule({ period: "daily", count: 0 })).toBe("Daily");
    expect(formatSchedule({ period: "weekly", count: -3 })).toBe("Weekly");
  });

  it("uses consistent casing between single- and multi-count labels", () => {
    expect(formatSchedule({ period: "yearly" })).toBe("Yearly");
    expect(formatSchedule({ period: "yearly", count: 2 })).toBe("2× Yearly");
  });
});

describe("parseStoredSchedule", () => {
  it("reads a well-formed schedule with count", () => {
    expect(parseStoredSchedule({ period: "weekly", count: 2 })).toEqual({
      period: "weekly",
      count: 2,
    });
  });

  it("omits a missing or non-finite count", () => {
    expect(parseStoredSchedule({ period: "monthly" })).toEqual({
      period: "monthly",
    });
    expect(parseStoredSchedule({ period: "daily", count: Number.NaN })).toEqual({
      period: "daily",
    });
  });

  it("returns undefined for missing, non-object, or invalid-period input", () => {
    expect(parseStoredSchedule(undefined)).toBeUndefined();
    expect(parseStoredSchedule(null)).toBeUndefined();
    expect(parseStoredSchedule("daily")).toBeUndefined();
    expect(parseStoredSchedule({ period: "fortnightly" })).toBeUndefined();
    expect(parseStoredSchedule({ count: 3 })).toBeUndefined();
  });

  it("drops a non-positive-integer count (0, negative, fractional)", () => {
    expect(parseStoredSchedule({ period: "daily", count: 0 })).toEqual({
      period: "daily",
    });
    expect(parseStoredSchedule({ period: "daily", count: -3 })).toEqual({
      period: "daily",
    });
    expect(parseStoredSchedule({ period: "daily", count: 2.5 })).toEqual({
      period: "daily",
    });
  });

  it("ignores count for an irregular period", () => {
    expect(parseStoredSchedule({ period: "irregular", count: 5 })).toEqual({
      period: "irregular",
    });
  });
});

describe("schedulesEqual", () => {
  it("treats an omitted count as 1", () => {
    expect(schedulesEqual({ period: "daily" }, { period: "daily", count: 1 })).toBe(
      true,
    );
  });

  it("distinguishes different periods or counts", () => {
    expect(schedulesEqual({ period: "daily" }, { period: "weekly" })).toBe(false);
    expect(
      schedulesEqual({ period: "daily", count: 2 }, { period: "daily", count: 3 }),
    ).toBe(false);
  });

  it("ignores count for irregular", () => {
    expect(
      schedulesEqual({ period: "irregular" }, { period: "irregular", count: 9 }),
    ).toBe(true);
  });
});

describe("scheduleToFirestore", () => {
  it("emits only defined fields (never an undefined count)", () => {
    expect(scheduleToFirestore({ period: "daily" })).toEqual({
      period: "daily",
    });
    const out = scheduleToFirestore({ period: "weekly", count: 2 });
    expect(out).toEqual({ period: "weekly", count: 2 });
    expect("count" in scheduleToFirestore({ period: "daily" })).toBe(false);
  });

  it("never writes a count for an irregular schedule", () => {
    expect(scheduleToFirestore({ period: "irregular", count: 5 })).toEqual({
      period: "irregular",
    });
  });

  it("drops a non-positive-integer count rather than persisting it", () => {
    expect(scheduleToFirestore({ period: "daily", count: 2.5 })).toEqual({
      period: "daily",
    });
    expect(scheduleToFirestore({ period: "daily", count: 0 })).toEqual({
      period: "daily",
    });
  });
});

describe("normalizedDays", () => {
  it("returns undefined for a non-weekly period (days are weekly-only)", () => {
    expect(normalizedDays("daily", [1, 2])).toBeUndefined();
    expect(normalizedDays("monthly", [1])).toBeUndefined();
    expect(normalizedDays("irregular", [1])).toBeUndefined();
  });

  it("returns undefined when days is missing or not an array", () => {
    expect(normalizedDays("weekly", undefined)).toBeUndefined();
    expect(normalizedDays("weekly", 3)).toBeUndefined();
  });

  it("drops out-of-range and non-integer values", () => {
    expect(normalizedDays("weekly", [-1, 0, 6, 7, 2.5, 3])).toEqual([0, 3, 6]);
  });

  it("dedupes and sorts ascending", () => {
    expect(normalizedDays("weekly", [5, 1, 5, 3, 1])).toEqual([1, 3, 5]);
  });

  it("returns undefined for an empty or all-invalid list", () => {
    expect(normalizedDays("weekly", [])).toBeUndefined();
    expect(normalizedDays("weekly", [8, -2, 1.5])).toBeUndefined();
  });
});

describe("explicit weekly days", () => {
  it("parseStoredSchedule reads, normalizes, and prefers days over count", () => {
    expect(parseStoredSchedule({ period: "weekly", days: [4, 1, 1] })).toEqual({
      period: "weekly",
      days: [1, 4],
    });
    // days wins; a redundant count is dropped
    expect(
      parseStoredSchedule({ period: "weekly", count: 2, days: [1, 4] }),
    ).toEqual({ period: "weekly", days: [1, 4] });
  });

  it("parseStoredSchedule ignores days for non-weekly and falls back to count", () => {
    expect(parseStoredSchedule({ period: "daily", days: [1, 2] })).toEqual({
      period: "daily",
    });
    // invalid/empty days on a weekly falls back to count
    expect(
      parseStoredSchedule({ period: "weekly", count: 2, days: [] }),
    ).toEqual({ period: "weekly", count: 2 });
  });

  it("scheduleToFirestore writes days and drops the redundant count", () => {
    expect(
      scheduleToFirestore({ period: "weekly", count: 2, days: [1, 4] }),
    ).toEqual({ period: "weekly", days: [1, 4] });
    expect(
      "count" in scheduleToFirestore({ period: "weekly", days: [1, 4] }),
    ).toBe(false);
  });

  it("formatSchedule uses the day count for the multiplier prefix", () => {
    expect(formatSchedule({ period: "weekly", days: [1, 3, 5] })).toBe(
      "3× Weekly",
    );
    expect(formatSchedule({ period: "weekly", days: [3] })).toBe("Weekly");
  });

  it("schedulesEqual compares day sets, treating days and count as distinct", () => {
    expect(
      schedulesEqual(
        { period: "weekly", days: [1, 4] },
        { period: "weekly", days: [4, 1] },
      ),
    ).toBe(true);
    expect(
      schedulesEqual(
        { period: "weekly", days: [1, 4] },
        { period: "weekly", days: [1, 3] },
      ),
    ).toBe(false);
    // an explicit day set is not equal to a count-derived schedule
    expect(
      schedulesEqual(
        { period: "weekly", days: [2, 4] },
        { period: "weekly", count: 2 },
      ),
    ).toBe(false);
  });
});
