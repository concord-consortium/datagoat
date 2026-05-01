import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  HISTORY,
  dateAtOffset,
  dateOffsetFromISO,
  fmtDate,
  toISO,
} from "../../utils/dates";
import type { ChipState } from "../../utils/wellnessCompleteness";
import common from "../common.module.css";
import css from "./DateNav.module.css";

export interface DateNavProps {
  // The current date offset in [0, HISTORY] - parent (WellnessLog,
  // PerformanceLog) typically derives this from useSearchParams.
  offset: number;
  // When true, render the completeness chip + legend below the prev/next row.
  // Used by Health & Wellness Log; Performance Log omits.
  withChip?: boolean;
  chipState?: ChipState;
}

// Date navigator with prev/next buttons. Reads + writes the ?date=
// search param so browser back/forward, refresh, and shareable links
// just work. Direct navigation to /wellness with no ?date= falls back
// to today (offset HISTORY).
export function DateNav({ offset, withChip, chipState }: DateNavProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const date = useMemo(() => dateAtOffset(offset), [offset]);
  const labelText = fmtDate(date);

  function setOffset(next: number) {
    if (next < 0 || next > HISTORY) return;
    const params = new URLSearchParams(searchParams);
    params.set("date", toISO(dateAtOffset(next)));
    setSearchParams(params, { replace: false });
  }

  const containerCls = withChip
    ? `${css.dateNav} ${css.dateNavWithLegend}`
    : css.dateNav;

  return (
    <div className={containerCls} data-sticky-chrome>
      <div className={css.dateNavRow}>
        <button
          type="button"
          className={css.dateNavBtn}
          aria-label="Previous date"
          onClick={() => setOffset(offset - 1)}
          disabled={offset <= 0}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className={css.dateNavCenter}>
          {withChip && (
            <>
              <span
                className={`${css.dateNavChip} ${chipClass(chipState ?? "none")}`}
                aria-hidden="true"
                data-chip-state={chipState ?? "none"}
              />
              <span
                role="status"
                aria-live="polite"
                className={common.visuallyHidden}
              >
                {chipStatusText(chipState ?? "none")}
              </span>
            </>
          )}
          <span className={css.dateNavLabel}>{labelText}</span>
        </span>
        <button
          type="button"
          className={css.dateNavBtn}
          aria-label="Next date"
          onClick={() => setOffset(offset + 1)}
          disabled={offset >= HISTORY}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
      {withChip && (
        <div className={css.dateNavLegend}>
          <span className={css.dateNavLegendLabel}>Data entered:</span>
          <span className={css.heatmapLegendItem}>
            <span className={`${css.heatmapLegendSwatch} ${css.swatchAll}`} />{" "}
            All
          </span>
          <span className={css.heatmapLegendItem}>
            <span className={`${css.heatmapLegendSwatch} ${css.swatchSome}`} />{" "}
            Some
          </span>
          <span className={css.heatmapLegendItem}>
            <span className={`${css.heatmapLegendSwatch} ${css.swatchNone}`} />{" "}
            None
          </span>
        </div>
      )}
    </div>
  );
}

function chipClass(state: ChipState): string {
  if (state === "all") return css.chipAll;
  if (state === "some") return css.chipSome;
  return css.chipNone;
}

function chipStatusText(state: ChipState): string {
  if (state === "all") return "All wellness metrics entered for this day.";
  if (state === "some") return "Some wellness metrics entered for this day.";
  return "No wellness metrics entered for this day.";
}

// Re-export so callers in WellnessLog / PerformanceLog can convert their
// `?date=` search param to an offset without re-importing dateOffsetFromISO.
export { dateOffsetFromISO };
