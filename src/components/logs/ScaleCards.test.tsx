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
    />,
  );
  const group = result.getByRole("radiogroup");
  const cards = within(group).getAllByRole("button");
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
    expect(within(rows[0]).getAllByRole("button")).toHaveLength(4); // ceil(7/2)
    expect(within(rows[1]).getAllByRole("button")).toHaveLength(3); // floor(7/2)
    // uniform width driver: both rows sized to the larger (top) row
    expect(group.style.getPropertyValue("--per-row")).toBe("4");
  });

  it("applies a background color to each card", () => {
    const { cards } = renderCards({ count: 4 });
    cards.forEach((c) => expect(c.getAttribute("style")).toMatch(/background/));
  });
});

describe("ScaleCards selection", () => {
  it("fires onChange with the level value on click and marks it pressed", () => {
    const { cards, onChange } = renderCards({ count: 5 });
    fireEvent.click(cards[2]);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("marks the selected card aria-pressed and makes it the tab stop", () => {
    const { cards } = renderCards({ count: 5, value: 4 });
    expect(cards[3].getAttribute("aria-pressed")).toBe("true");
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

  it("number keys jump to the k-th card", () => {
    const onChange = vi.fn();
    const { cards } = renderCards({ levels: levelsOf([10, 20, 30]), onChange });
    fireEvent.keyDown(cards[0], { key: "3" });
    expect(onChange).toHaveBeenCalledWith(30);
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
