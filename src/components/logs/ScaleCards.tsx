import { useCallback, useRef } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import clsx from "clsx";
import type { CustomMetricLevel } from "../../types/customMetrics";
import { readableTextOn } from "../../data/scaleColors";
import css from "./ScaleCards.module.css";

export interface ScaleCardsProps {
  // Ordered levels (label + numeric value). Card order follows this array.
  levels: CustomMetricLevel[];
  // Card background colors, 1:1 with `levels` (see resolveScaleColors).
  colors: string[];
  // Currently-selected level value; undefined = nothing logged yet.
  value: number | undefined;
  onChange: (next: number) => void;
  // id of the element naming this group (for aria-labelledby).
  labelledBy: string;
  // Accessible name per card. Needed when the visible content is non-textual
  // (e.g. mood face icons) or non-descriptive.
  ariaLabelFormat?: (index: number, count: number, level: CustomMetricLevel) => string;
  // Custom visible card content (e.g. an icon). Defaults to `level.label` text.
  // When this renders non-text content, provide `ariaLabelFormat` for the name.
  renderLabel?: (level: CustomMetricLevel, index: number) => ReactNode;
}

// Up to this many cards render in a single row; more wrap to two rows.
const MAX_SINGLE_ROW = 5;

// A colored-card picker for "scale" metrics (mood, hydration, custom ordinal
// scales). Ports hydration's keyboard/a11y contract: role=radiogroup, one tab
// stop, Arrow keys advance-and-fire (no wrap), focus follows selection. Arrow
// nav is index-based (maps index -> level.value), so non-contiguous values
// (e.g. 10/20/30) work. Digit keys select per `valueMode` (see below): when the
// cards visibly show their numbers a digit picks the card printed with it;
// otherwise (icons, word labels, sparse values) it picks the k-th card by
// position.
export function ScaleCards({
  levels,
  colors,
  value,
  onChange,
  labelledBy,
  ariaLabelFormat,
  renderLabel,
}: ScaleCardsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const n = levels.length;
  // <=5 cards: one row. Otherwise two rows with the larger half on top; all
  // cards are sized to `perRow` so widths are uniform and the shorter bottom
  // row centers (see ScaleCards.module.css).
  const perRow = n <= MAX_SINGLE_ROW ? n : Math.ceil(n / 2);
  const selectedIndex =
    value === undefined ? -1 : levels.findIndex((l) => l.value === value);
  const noSelection = selectedIndex === -1;

  // Digit-key behavior is chosen once per scale, keyed on what the card *shows*
  // rather than its stored value -- a digit shortcut only makes sense when the
  // user can see that number on the card. "Value mode" (a digit selects the card
  // printed with it) requires both:
  //   (a) every card renders its value as visible text -- no icon (`renderLabel`)
  //       and `label === String(value)`; and
  //   (b) at least one value is a single digit (0-9) a key can express.
  // Otherwise digits act as 1-indexed card positions. That covers mood's icon
  // cards, word-labelled custom scales (Low/Mid/High), and sparse numeric values
  // (10/20/30) -- in all of which the printed content isn't a typable digit.
  const showsItsNumber = (l: CustomMetricLevel) =>
    l.value !== undefined && l.label === String(l.value);
  const valueMode =
    !renderLabel &&
    levels.every(showsItsNumber) &&
    levels.some(
      (l) => l.value !== undefined && Number.isInteger(l.value) && l.value >= 0 && l.value <= 9,
    );

  const select = useCallback(
    (index: number) => {
      if (index < 0 || index >= n) return;
      const v = levels[index].value;
      if (v === undefined) return;
      if (v !== value) onChange(v);
      // Focus the target card so the keyboard contract advances.
      refs.current[index]?.focus();
    },
    [levels, n, value, onChange],
  );

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      select(Math.min(n - 1, index + 1)); // no wrap at the right edge
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      select(Math.max(0, index - 1)); // no wrap at the left edge
      return;
    }
    if (/^[0-9]$/.test(e.key)) {
      const d = Number(e.key);
      if (valueMode) {
        // Numbered scale: the digit is the number printed on a card. Jump to
        // the card showing it; a digit no card shows is a no-op. (Two-digit
        // labels like "10" -- a 0..10 pain scale's top card -- can't be typed as
        // one key and are reached with the arrows.)
        const target = levels.findIndex((l) => l.label === e.key);
        if (target >= 0) {
          e.preventDefault();
          select(target);
        }
      } else if (d >= 1 && d <= n) {
        // Un-numbered scale: the digit is a 1-indexed card position ("0" has no
        // positional meaning, so it falls through and is ignored).
        e.preventDefault();
        select(d - 1);
      }
    }
  }

  const rows =
    n <= MAX_SINGLE_ROW ? [levels] : [levels.slice(0, perRow), levels.slice(perRow)];

  return (
    <div
      className={css.scaleCards}
      role="radiogroup"
      aria-labelledby={labelledBy}
      style={{ "--per-row": perRow } as CSSProperties}
    >
      {rows.map((row, rowIdx) => {
        const rowStart = rowIdx === 0 ? 0 : perRow;
        return (
          <div className={css.cardRow} data-testid="scale-card-row" key={rowIdx}>
            {row.map((level, i) => {
              const index = rowStart + i;
              const selected = index === selectedIndex;
              const bg = colors[index];
              // When no format is given, omit aria-label so the accessible name
              // comes from the visible card text: word labels read directly, and
              // emoji are announced by their screen-reader names.
              const ariaLabel = ariaLabelFormat
                ? ariaLabelFormat(index, n, level)
                : undefined;
              return (
                <button
                  key={`${index}-${level.value}`}
                  ref={(node) => {
                    refs.current[index] = node;
                  }}
                  type="button"
                  // role=radio (not the default button role) so the group is a
                  // conformant radiogroup: a screen reader announces each card as
                  // a radio with its selected state and position, and exclusivity
                  // is conveyed. aria-checked (not aria-pressed, which models an
                  // independent toggle) marks the current selection.
                  role="radio"
                  className={clsx(css.card, selected && css.selected)}
                  style={{ background: bg, color: readableTextOn(bg) }}
                  aria-label={ariaLabel}
                  aria-checked={selected}
                  tabIndex={selected || (noSelection && index === 0) ? 0 : -1}
                  onClick={() => select(index)}
                  onKeyDown={(e) => onKeyDown(e, index)}
                >
                  {renderLabel ? renderLabel(level, index) : level.label}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
