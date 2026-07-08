// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { ScaleCards } from "./ScaleCards";
import type { CustomMetricLevel } from "../../types/customMetrics";

function levelsOf(values: number[], labels?: string[]): CustomMetricLevel[] {
  return values.map((v, i) => ({ label: labels?.[i] ?? String(v), value: v }));
}
const rampOf = (n: number) =>
  Array.from({ length: n }, (_, i) => `#${(i + 1).toString(16).padStart(2, "0")}0000`);

function renderCards(
  props: Partial<React.ComponentProps<typeof ScaleCards>> & { count?: number } = {},
) {
  const count = props.count ?? 5;
  const levels = props.levels ?? levelsOf(Array.from({ length: count }, (_, i) => i + 1));
  const onChange = props.onChange ?? vi.fn();
  const result = render(
    <ScaleCards
      levels={levels}
      colors={props.colors ?? rampOf(levels.length)}
      value={props.value}
      onChange={onChange}
      labelledBy={props.labelledBy ?? "label-id"}
      ariaLabelFormat={props.ariaLabelFormat}
      renderLabel={props.renderLabel}
    />,
  );
  const group = result.getByRole("radiogroup");
  const cards = within(group).getAllByRole("radio");
  return { ...result, group, cards, onChange, levels };
}

describe("ScaleCards layout", () => {
  it("renders one card per level with its label", () => {
    const { cards } = renderCards({
      levels: levelsOf([1, 2, 3], ["a", "b", "c"]),
    });
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.textContent)).toEqual(["a", "b", "c"]);
  });

  it("uses a single row for 5 or fewer cards", () => {
    const { getAllByTestId, group } = renderCards({ count: 5 });
    expect(getAllByTestId("scale-card-row")).toHaveLength(1);
    expect(group.style.getPropertyValue("--per-row")).toBe("5");
  });

  it("wraps 6+ into two rows with the larger half on top", () => {
    const { getAllByTestId, group } = renderCards({ count: 7 });
    const rows = getAllByTestId("scale-card-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getAllByRole("radio")).toHaveLength(4); // ceil(7/2)
    expect(within(rows[1]).getAllByRole("radio")).toHaveLength(3); // floor(7/2)
    // uniform width driver: both rows sized to the larger (top) row
    expect(group.style.getPropertyValue("--per-row")).toBe("4");
  });

  it("applies a background color to each card", () => {
    const { cards } = renderCards({ count: 4 });
    cards.forEach((c) => expect(c.getAttribute("style")).toMatch(/background/));
  });
});

describe("ScaleCards selection", () => {
  it("fires onChange with the level value on click and marks it checked", () => {
    const { cards, onChange } = renderCards({ count: 5 });
    fireEvent.click(cards[2]);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("marks the selected card aria-checked and makes it the tab stop", () => {
    const { cards } = renderCards({ count: 5, value: 4 });
    expect(cards[3].getAttribute("aria-checked")).toBe("true");
    expect(cards[3].getAttribute("tabindex")).toBe("0");
    expect(cards[0].getAttribute("tabindex")).toBe("-1");
  });

  it("makes the first card the tab stop when nothing is selected", () => {
    const { cards } = renderCards({ count: 5, value: undefined });
    expect(cards[0].getAttribute("tabindex")).toBe("0");
  });
});

describe("ScaleCards keyboard", () => {
  it("ArrowRight advances and fires the next card's value (non-contiguous values)", () => {
    const onChange = vi.fn();
    const { cards } = renderCards({ levels: levelsOf([10, 20, 30]), value: 10, onChange });
    fireEvent.keyDown(cards[0], { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it("ArrowLeft does not wrap past the first card", () => {
    const onChange = vi.fn();
    const { cards } = renderCards({ levels: levelsOf([10, 20, 30]), value: 10, onChange });
    fireEvent.keyDown(cards[0], { key: "ArrowLeft" });
    expect(onChange).not.toHaveBeenCalled();
  });

  // Un-numbered scale (no value is a single digit): a digit picks the k-th card
  // by position.
  it("number keys jump to the k-th card on an un-numbered scale", () => {
    const onChange = vi.fn();
    const { cards } = renderCards({ levels: levelsOf([10, 20, 30]), onChange });
    fireEvent.keyDown(cards[0], { key: "3" });
    expect(onChange).toHaveBeenCalledWith(30); // 3rd card by position
  });

  // Numbered scale (a value is a single digit): a digit selects the card with
  // that value, not the k-th card. A 0-based scale proves it's value- not
  // position-based (value 3 sits at index 3, so positional would give value 2).
  it("number keys select by value on a numbered scale", () => {
    const onChange = vi.fn();
    const { cards } = renderCards({ levels: levelsOf([0, 1, 2, 3, 4]), onChange });
    fireEvent.keyDown(cards[0], { key: "3" });
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("the 0 key selects a value-0 card (numbered scale)", () => {
    const onChange = vi.fn();
    const { cards } = renderCards({ levels: levelsOf([0, 1, 2]), onChange });
    fireEvent.keyDown(cards[2], { key: "0" });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("a digit no card carries is inert on a numbered scale", () => {
    const onChange = vi.fn();
    const { cards } = renderCards({ levels: levelsOf([1, 3, 5, 7, 9]), onChange });
    fireEvent.keyDown(cards[0], { key: "2" }); // no card has value 2
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(cards[0], { key: "5" }); // value 5 exists
    expect(onChange).toHaveBeenCalledWith(5);
  });

  // The mode is based on what the card *shows*, not its stored value. When the
  // cards render icons (renderLabel), digits are positional even though the
  // values are digits -- a 0-based scale makes value vs position observably
  // differ (value 3 is at index 3, so positional "3" yields value 2).
  it("uses positional digits when cards render icons, not their numeric value", () => {
    const onChange = vi.fn();
    const { cards } = renderCards({
      levels: levelsOf([0, 1, 2, 3, 4]),
      renderLabel: (level) => <span aria-hidden>{"*".repeat((level.value ?? 0) + 1)}</span>,
      onChange,
    });
    fireEvent.keyDown(cards[0], { key: "3" });
    expect(onChange).toHaveBeenCalledWith(2); // 3rd card by position, not value 3
  });

  // Likewise for word labels: the user doesn't see the numbers, so digits are
  // positional.
  it("uses positional digits when cards show word labels", () => {
    const onChange = vi.fn();
    const { cards } = renderCards({
      levels: levelsOf([0, 1, 2, 3, 4], ["a", "b", "c", "d", "e"]),
      onChange,
    });
    fireEvent.keyDown(cards[0], { key: "3" });
    expect(onChange).toHaveBeenCalledWith(2); // 3rd card by position, not value 3
  });
});

describe("ScaleCards labels", () => {
  it("omits aria-label by default so the accessible name is the card text", () => {
    const { cards } = renderCards({ levels: levelsOf([1, 2, 3], ["Low", "Mid", "High"]) });
    expect(cards[0].getAttribute("aria-label")).toBeNull();
    expect(cards[0]).toHaveAccessibleName("Low");
  });

  it("uses ariaLabelFormat when provided (e.g. emoji labels)", () => {
    const { cards } = renderCards({
      count: 5,
      ariaLabelFormat: (i, n) => `Mood ${i + 1} of ${n}`,
    });
    expect(cards[0].getAttribute("aria-label")).toBe("Mood 1 of 5");
  });
});
