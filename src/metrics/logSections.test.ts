import { describe, it, expect } from "vitest";
import { SECTIONS, sectionFor, sectionLabel, sectionEmptyText } from "./logSections";
import { DEFAULT_SCHEDULE } from "../types/metricSchedule";

describe("sectionFor", () => {
  it("maps each simple period to its own section", () => {
    expect(sectionFor({ period: "daily" })).toBe("daily");
    expect(sectionFor({ period: "weekly" })).toBe("weekly");
    expect(sectionFor({ period: "monthly" })).toBe("monthly");
  });

  it("maps yearly x4 to quarterly", () => {
    // How the codebase already encodes "Quarterly" (see metrics/types.ts).
    expect(sectionFor({ period: "yearly", count: 4 })).toBe("quarterly");
  });

  it("maps other yearly counts to yearly, not quarterly", () => {
    // Lean Mass is {yearly, count: 2} and shows under YEARLY in the prototype.
    expect(sectionFor({ period: "yearly", count: 2 })).toBe("yearly");
    expect(sectionFor({ period: "yearly", count: 1 })).toBe("yearly");
    expect(sectionFor({ period: "yearly" })).toBe("yearly");
    // count > 4 is not quarterly. Calling it so would be a visible lie.
    expect(sectionFor({ period: "yearly", count: 6 })).toBe("yearly");
  });

  it("maps irregular to asNeeded", () => {
    expect(sectionFor({ period: "irregular" })).toBe("asNeeded");
    expect(sectionFor(DEFAULT_SCHEDULE)).toBe("asNeeded");
  });

  it("ignores count on non-yearly periods", () => {
    expect(sectionFor({ period: "daily", count: 3 })).toBe("daily");
    expect(sectionFor({ period: "weekly", count: 4 })).toBe("weekly");
  });
});

describe("SECTIONS", () => {
  it("is in prototype display order", () => {
    expect([...SECTIONS]).toEqual([
      "daily",
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
      "asNeeded",
    ]);
  });

  it("has a label and empty text for every section", () => {
    for (const key of SECTIONS) {
      expect(sectionLabel(key)).toBeTruthy();
      expect(sectionEmptyText(key)).toBeTruthy();
    }
  });
});

describe("sectionLabel", () => {
  it("matches the prototype headings", () => {
    expect(sectionLabel("daily")).toBe("Daily Metrics");
    expect(sectionLabel("asNeeded")).toBe("As Needed Metrics");
  });
});

describe("sectionEmptyText", () => {
  it("matches the prototype empty state", () => {
    expect(sectionEmptyText("weekly")).toBe("No weekly metrics to track");
  });
});
