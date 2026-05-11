// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ActivityCalendar } from "./ActivityCalendar";
import { HISTORY, dateAtOffset, toISO } from "../../utils/dates";
import type { HealthEntry } from "../../types/data";

const TRACKED_HEALTH = [
  "hydration",
  "sleepTime",
  "sleepEfficiency",
  "protein",
  "leanMass",
  "availability",
];

function fullEntry(date: string): HealthEntry {
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
      practiceParticipation: true, // played
      gameHeld: false,
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
  it("renders tappable Link cells for health with state !== inactive AND offset in [0, HISTORY]", () => {
    const todayIso = toISO(dateAtOffset(HISTORY));
    const { container } = renderCalendar({
      type: "health",
      trackedMetricIds: TRACKED_HEALTH,
      healthEntries: [fullEntry(todayIso)],
    });
    // Today's cell has state='all', offset=HISTORY - should be a Link.
    const links = container.querySelectorAll(`a[href*="/health?date="]`);
    expect(links.length).toBeGreaterThan(0);
    const todayLink = Array.from(links).find((a) =>
      (a as HTMLAnchorElement).getAttribute("href")?.includes(todayIso),
    ) as HTMLAnchorElement | undefined;
    expect(todayLink).toBeDefined();
    // Tappable cells are plain anchors: no role="button", no explicit
    // tabindex (anchors are focusable by default), no synthetic Space
    // handler. Enter activates the link natively.
    expect(todayLink?.getAttribute("role")).toBeNull();
    expect(todayLink?.getAttribute("tabindex")).toBeNull();
  });

  it("renders future-dated cells as <div> (no Link, no role, no tabindex)", () => {
    const { container } = renderCalendar({
      type: "health",
      trackedMetricIds: TRACKED_HEALTH,
      healthEntries: [],
    });
    // Partition real day cells by tag rather than by state class: anchors
    // are tappable, <div>s are non-tappable. Length guards ensure a class
    // rename can't silently empty the assertion.
    const allCells = Array.from(
      container.querySelectorAll(`[class*='heatmapCell']`),
    );
    const realCells = allCells.filter(
      (c) => c.querySelector(`[class*='visuallyHidden']`) !== null,
    );
    const nonAnchorCells = realCells.filter(
      (c) => c.tagName.toLowerCase() !== "a",
    );
    expect(realCells.length).toBeGreaterThan(0);
    expect(nonAnchorCells.length).toBeGreaterThan(0);
    nonAnchorCells.forEach((cell) => {
      expect(cell.tagName.toLowerCase()).toBe("div");
      expect(cell.getAttribute("role")).toBeNull();
      expect(cell.getAttribute("tabindex")).toBeNull();
    });
  });

  it("emits a visually-hidden label on every non-blank cell", () => {
    const todayIso = toISO(dateAtOffset(HISTORY));
    const { container } = renderCalendar({
      type: "health",
      trackedMetricIds: TRACKED_HEALTH,
      healthEntries: [fullEntry(todayIso)],
    });
    const labels = container.querySelectorAll(`[class*='visuallyHidden']`);
    // At minimum every visible day cell has a label.
    expect(labels.length).toBeGreaterThanOrEqual(7);
    // Labels include both the formatted date and a state phrase.
    const labelTexts = Array.from(labels).map((n) => n.textContent ?? "");
    // Short-month per spec example "Nov 3, 2026: all metrics logged".
    expect(
      labelTexts.some((t) =>
        /[A-Z][a-z]{2} \d+, \d{4}( \(today\))?: all metrics logged/.test(t),
      ),
    ).toBe(true);
  });

  it("health tappable cell links to /health?date=ISO", () => {
    const todayIso = toISO(dateAtOffset(HISTORY));
    const { container } = renderCalendar({
      type: "health",
      trackedMetricIds: TRACKED_HEALTH,
      healthEntries: [fullEntry(todayIso)],
    });
    const link = container.querySelector(
      `a[href="/health?date=${todayIso}"]`,
    );
    expect(link).not.toBeNull();
  });

  it("the today cell has the today modifier", () => {
    const todayIso = toISO(dateAtOffset(HISTORY));
    const { container } = renderCalendar({
      type: "health",
      trackedMetricIds: TRACKED_HEALTH,
      healthEntries: [fullEntry(todayIso)],
    });
    const todayCell = container.querySelector(`[class*='today']`);
    expect(todayCell).not.toBeNull();
  });
});
