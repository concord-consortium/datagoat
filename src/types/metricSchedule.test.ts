// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SCHEDULE,
  resolveSchedule,
  formatSchedule,
  parseStoredSchedule,
  scheduleToFirestore,
  schedulesEqual,
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

  it("prefixes a multiple count with the period", () => {
    expect(formatSchedule({ period: "daily", count: 3 })).toBe("3× daily");
    expect(formatSchedule({ period: "weekly", count: 2 })).toBe("2× weekly");
    expect(formatSchedule({ period: "yearly", count: 2 })).toBe("2× yearly");
  });

  it("labels irregular regardless of count", () => {
    expect(formatSchedule({ period: "irregular" })).toBe("Irregular");
    expect(formatSchedule({ period: "irregular", count: 5 })).toBe("Irregular");
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
});
