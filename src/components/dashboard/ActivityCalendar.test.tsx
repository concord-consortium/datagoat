// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ActivityCalendar } from "./ActivityCalendar";
import { HISTORY, dateAtOffset, toISO } from "../../utils/dates";
import type { WellnessEntry } from "../../types/data";

const TRACKED_WELLNESS = [
  "hydration",
  "sleepTime",
  "sleepEfficiency",
  "protein",
  "leanMass",
  "availability",
];

function fullEntry(date: string): WellnessEntry {
  return {
    version: 1,
    date,
    hydration: 4,
    sleepTime: 8,
    sleepEfficiency: 90,
    protein: 1.2,
    leanMass: 60,
    availability: {
      practiceHeld: true,
      practiceParticipation: "played",
      gameHeld: false,
      gameParticipation: null,
    },
  };
}

function renderCalendar(props: Parameters<typeof ActivityCalendar>[0]) {
  return render(
    <MemoryRouter>
      <ActivityCalendar {...props} />
    </MemoryRouter>,
  );
}

describe("ActivityCalendar", () => {
  it("renders tappable Link cells for wellness with state !== inactive AND offset in [0, HISTORY]", () => {
    const todayIso = toISO(dateAtOffset(HISTORY));
    const { container } = renderCalendar({
      type: "wellness",
      trackedMetricIds: TRACKED_WELLNESS,
      wellnessEntries: [fullEntry(todayIso)],
    });
    // Today's cell has state='all', offset=HISTORY - should be a Link.
    const links = container.querySelectorAll(`a[href*="/wellness?date="]`);
    expect(links.length).toBeGreaterThan(0);
    const todayLink = Array.from(links).find((a) =>
      (a as HTMLAnchorElement).getAttribute("href")?.includes(todayIso),
    ) as HTMLAnchorElement | undefined;
    expect(todayLink).toBeDefined();
  });

  it("renders future-dated cells as <div> (no Link, no role, no tabindex)", () => {
    const { container } = renderCalendar({
      type: "wellness",
      trackedMetricIds: TRACKED_WELLNESS,
      wellnessEntries: [],
    });
    // All cells - any inactive ones should be <div>, not <a>.
    const inactiveCells = container.querySelectorAll(
      `[class*='inactive']`,
    );
    inactiveCells.forEach((cell) => {
      expect(cell.tagName.toLowerCase()).toBe("div");
      expect(cell.getAttribute("role")).toBeNull();
      expect(cell.getAttribute("tabindex")).toBeNull();
    });
  });

  it("performance cells are non-interactive <div> across the board", () => {
    const { container } = renderCalendar({
      type: "performance",
      trackedMetricIds: ["wins"],
      performanceEntries: [],
    });
    const cells = container.querySelectorAll(`[class*='heatmapCell']`);
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((cell) => {
      expect(cell.tagName.toLowerCase()).toBe("div");
      // No <a> children that might create a navigable Link.
      expect(cell.querySelectorAll("a").length).toBe(0);
    });
  });

  it("emits a visually-hidden label on every non-blank cell", () => {
    const todayIso = toISO(dateAtOffset(HISTORY));
    const { container } = renderCalendar({
      type: "wellness",
      trackedMetricIds: TRACKED_WELLNESS,
      wellnessEntries: [fullEntry(todayIso)],
    });
    const labels = container.querySelectorAll(`[class*='visuallyHidden']`);
    // At minimum every visible day cell has a label.
    expect(labels.length).toBeGreaterThanOrEqual(7);
    // Labels include both the formatted date and a state phrase.
    const labelTexts = Array.from(labels).map((n) => n.textContent ?? "");
    expect(
      labelTexts.some((t) =>
        /[A-Z][a-z]+ \d+, \d{4}( \(today\))?: all metrics logged/.test(t),
      ),
    ).toBe(true);
  });

  it("wellness tappable cell links to /wellness?date=ISO", () => {
    const todayIso = toISO(dateAtOffset(HISTORY));
    const { container } = renderCalendar({
      type: "wellness",
      trackedMetricIds: TRACKED_WELLNESS,
      wellnessEntries: [fullEntry(todayIso)],
    });
    const link = container.querySelector(
      `a[href="/wellness?date=${todayIso}"]`,
    );
    expect(link).not.toBeNull();
  });

  it("the today cell has the today modifier", () => {
    const todayIso = toISO(dateAtOffset(HISTORY));
    const { container } = renderCalendar({
      type: "wellness",
      trackedMetricIds: TRACKED_WELLNESS,
      wellnessEntries: [fullEntry(todayIso)],
    });
    const todayCell = container.querySelector(`[class*='today']`);
    expect(todayCell).not.toBeNull();
  });
});
