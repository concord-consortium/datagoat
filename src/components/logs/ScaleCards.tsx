import { useCallback, useRef } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
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
  // Accessible name per card. Needed when the visible label is non-descriptive
  // (e.g. mood emoji). Defaults to hydration's "${i+1} of ${n}".
  ariaLabelFormat?: (index: number, count: number, level: CustomMetricLevel) => string;
}

// Up to this many cards render in a single row; more wrap to two rows.
const MAX_SINGLE_ROW = 5;

// A colored-card picker for "scale" metrics (mood, hydration, custom ordinal
// scales). Ports hydration's keyboard/a11y contract: role=radiogroup, one tab
// stop, Arrow keys advance-and-fire (no wrap), number keys jump, focus follows
// selection. Keyboard nav is index-based and maps index -> level.value, so
// non-contiguous values (e.g. 10/20/30) work.
export function ScaleCards({
  levels,
  colors,
  value,
  onChange,
  labelledBy,
  ariaLabelFormat,
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
    if (/^[1-9]$/.test(e.key)) {
      const k = Number(e.key); // jump to the k-th card
      if (k >= 1 && k <= n) {
        e.preventDefault();
        select(k - 1);
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
                  className={clsx(css.card, selected && css.selected)}
                  style={{ background: bg, color: readableTextOn(bg) }}
                  aria-label={ariaLabel}
                  aria-pressed={selected}
                  tabIndex={selected || (noSelection && index === 0) ? 0 : -1}
                  onClick={() => select(index)}
                  onKeyDown={(e) => onKeyDown(e, index)}
                >
                  {level.label}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
