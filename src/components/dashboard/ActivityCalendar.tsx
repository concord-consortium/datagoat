import { memo, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import common from "../common.module.css";
import css from "./ActivityCalendar.module.css";
import { HISTORY, dateAtOffset, toISO } from "../../utils/dates";
import { getChipState } from "../../utils/wellnessCompleteness";
import type { PerformanceEntry, WellnessEntry } from "../../types/data";

// Cell state per requirements:
//   all      - every tracked metric logged
//   some     - at least one metric logged (wellness only)
//   none     - tracked window, no data
//   inactive - outside [0, HISTORY] tracking window (future or before
//              first tracked day)
//   blank    - structural padding (visibility: hidden, no a11y label)
type CellState = "all" | "some" | "none" | "inactive" | "blank";

const VISIBLE_WEEKS = 3;
const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTH_NAMES_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface CellInfo {
  date: Date | null;
  state: CellState;
  // Offset relative to today: HISTORY = today, 0 = oldest. NaN for blank/
  // out-of-window cells.
  offset: number;
}

export interface ActivityCalendarProps {
  type: "wellness" | "performance";
  // Tracked metric IDs - used for wellness completeness derivation. For
  // type='performance' the prop is ignored (any data => 'all').
  trackedMetricIds: string[];
  wellnessEntries?: WellnessEntry[];
  performanceEntries?: PerformanceEntry[];
}

// Per-cell label phrase per spec acceptance criteria. Wellness has 4
// states; performance is binary (all/none) in this story per the
// prototype's 2-state coloring for the perf calendar.
function stateLabel(state: CellState): string {
  switch (state) {
    case "all":
      return "all metrics logged";
    case "some":
      return "some metrics logged";
    case "none":
      return "no metrics logged";
    case "inactive":
      return "outside tracking window";
    default:
      return "";
  }
}

// Derive the visible weeks - oldest week first, last week ends on today.
// Each week is 7 cells (Sun-Sat). Cells outside [0, HISTORY] are inactive
// (rendered but not interactive); padding cells at the front/back to
// align Sun-Sat are 'blank'.
function buildWeeks(
  todayIso: string,
  wellnessByDate: Map<string, WellnessEntry>,
  performanceByDate: Map<string, PerformanceEntry>,
  trackedMetricIds: string[],
  type: "wellness" | "performance",
): { weeks: CellInfo[][]; starWeek: number; starDay: number } {
  const today = dateAtOffset(HISTORY);
  const todayDow = today.getDay();
  const tailPad = 6 - todayDow;
  const totalDays = HISTORY + 1; // 30
  const cells: CellInfo[] = [];

  // Front pad to align Sun-Sat. We want the LAST week to end on today's
  // day-of-week. Total cells = HISTORY + 1 + tailPad + frontPad, must be
  // a multiple of 7.
  const usedTail = tailPad;
  const lengthBeforeFront = totalDays + usedTail;
  const frontPad = (7 - (lengthBeforeFront % 7)) % 7;

  // Front blanks
  for (let i = 0; i < frontPad; i++) {
    cells.push({ date: null, state: "blank", offset: NaN });
  }

  // Real days, oldest first.
  for (let offset = 0; offset <= HISTORY; offset++) {
    const d = dateAtOffset(offset);
    const iso = toISO(d);
    let state: CellState = "none";
    if (type === "wellness") {
      const entry = wellnessByDate.get(iso) ?? null;
      state = getChipState(entry, trackedMetricIds);
    } else {
      const entry = performanceByDate.get(iso) ?? null;
      const hasAny =
        !!entry &&
        Object.values(entry.metrics ?? {}).some((v) => {
          if (typeof v === "number") return v > 0;
          if (typeof v === "string") return v.trim() !== "";
          return false;
        });
      state = hasAny ? "all" : "none";
    }
    cells.push({ date: d, state, offset });
  }

  // Tail pad (future days within today's week) - inactive (real dates,
  // but not in [0, HISTORY] since they're after today).
  for (let i = 1; i <= tailPad; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    cells.push({ date: d, state: "inactive", offset: NaN });
  }

  // Find today's row/col.
  const todayIndex = cells.findIndex((c) => c.date && toISO(c.date) === todayIso);
  const starWeek = Math.floor(todayIndex / 7);
  const starDay = todayIndex % 7;

  // Slice into weeks.
  const weeks: CellInfo[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return { weeks, starWeek, starDay };
}

function ActivityCalendarImpl(props: ActivityCalendarProps) {
  const { type, trackedMetricIds } = props;
  const wellnessEntries = props.wellnessEntries ?? [];
  const performanceEntries = props.performanceEntries ?? [];

  // Memoize the per-day completeness derivation. The dashboard re-renders
  // on every Firestore snapshot; without memo, all 30 cells re-derive on
  // every keystroke that triggers a debounced commit.
  const todayIso = toISO(dateAtOffset(HISTORY));

  const wellnessByDate = useMemo(() => {
    const m = new Map<string, WellnessEntry>();
    for (const e of wellnessEntries) m.set(e.date, e);
    return m;
  }, [wellnessEntries]);

  const performanceByDate = useMemo(() => {
    const m = new Map<string, PerformanceEntry>();
    for (const e of performanceEntries) m.set(e.date, e);
    return m;
  }, [performanceEntries]);

  const { weeks, starWeek, starDay } = useMemo(
    () =>
      buildWeeks(
        todayIso,
        wellnessByDate,
        performanceByDate,
        trackedMetricIds,
        type,
      ),
    [todayIso, wellnessByDate, performanceByDate, trackedMetricIds, type],
  );

  const totalWeeks = weeks.length;
  const initialOffset = Math.max(0, totalWeeks - VISIBLE_WEEKS);
  const [scrollOffset, setScrollOffset] = useState(initialOffset);

  const startIdx = Math.min(scrollOffset, Math.max(0, totalWeeks - 1));
  const endIdx = Math.min(startIdx + VISIBLE_WEEKS, totalWeeks);
  const visibleWeeks = weeks.slice(startIdx, endIdx);

  const today = dateAtOffset(HISTORY);
  const yearLabel = today.getFullYear();

  const colorClass =
    type === "wellness" ? css.calWellness : css.calPerformance;

  const calLabel =
    type === "wellness"
      ? "Health & Wellness Log calendar"
      : "Performance Log calendar";

  const upDisabled = startIdx <= 0;
  const downDisabled = endIdx >= totalWeeks;

  return (
    <div className={`${css.sectionCal} ${colorClass}`}>
      <div className={css.heatmapDayLabels}>
        <span className={css.heatmapYearLabel}>{yearLabel}</span>
        {DAY_LABELS.map((d, i) => (
          <span
            key={i}
            className={css.heatmapDayLabel}
            aria-label={DAY_FULL[i]}
          >
            {d}
          </span>
        ))}
      </div>
      <div className={css.sectionCalScrollWrap}>
        <div
          className={css.sectionCalWeeks}
          role="region"
          aria-label={calLabel}
        >
          <div className={css.sectionCalMonthLabels}>
            {Array.from({ length: VISIBLE_WEEKS }).map((_, i) => {
              const week = visibleWeeks[i];
              const firstReal = week?.find(
                (c) => c.date !== null && c.state !== "blank",
              );
              const monthIdx = firstReal?.date?.getMonth();
              const prevMonthIdx =
                i > 0
                  ? visibleWeeks[i - 1]?.find(
                      (c) => c.date !== null && c.state !== "blank",
                    )?.date?.getMonth()
                  : undefined;
              const showLabel =
                monthIdx !== undefined && monthIdx !== prevMonthIdx;
              return (
                <span key={i} className={css.sectionCalMonthLabel}>
                  {showLabel ? MONTH_NAMES_SHORT[monthIdx!] : ""}
                </span>
              );
            })}
          </div>
          <div className={css.sectionCalCellsBox}>
            {Array.from({ length: VISIBLE_WEEKS }).map((_, i) => {
              const week = visibleWeeks[i];
              return (
                <div key={i} className={css.heatmapCells}>
                  {Array.from({ length: 7 }).map((__, d) => {
                    const cell = week?.[d];
                    if (!cell) {
                      return (
                        <div
                          key={d}
                          className={`${css.heatmapCell} ${css.blank}`}
                        />
                      );
                    }
                    return (
                      <CellNode
                        key={d}
                        cell={cell}
                        weekIdx={startIdx + i}
                        dayIdx={d}
                        starWeek={starWeek}
                        starDay={starDay}
                        type={type}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className={css.sectionCalNav}>
            <button
              type="button"
              className={css.sectionCalNavBtn}
              aria-label="Show earlier weeks"
              disabled={upDisabled}
              onClick={() => setScrollOffset((o) => Math.max(0, o - 1))}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <polyline points="17 14.5 12 9.5 7 14.5" />
              </svg>
            </button>
            <button
              type="button"
              className={css.sectionCalNavBtn}
              aria-label="Show later weeks"
              disabled={downDisabled}
              onClick={() =>
                setScrollOffset((o) =>
                  Math.min(totalWeeks - VISIBLE_WEEKS, o + 1),
                )
              }
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <polyline points="7 9.5 12 14.5 17 9.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      {/* Legend - per spec, per-cell visually-hidden labels are emitted on
          each cell so SR traversal stays comprehensible; the visible
          legend stays for sighted users (matches prototype). */}
      <div className={css.sectionCalLegend} aria-hidden="true">
        <span className={css.sectionCalLegendLabel}>Data entered:</span>
        {type === "wellness" ? (
          <>
            <span className={css.heatmapLegendItem}>
              <span
                className={`${css.heatmapLegendSwatch} ${css.swatchAll}`}
              />{" "}
              All
            </span>
            <span className={css.heatmapLegendItem}>
              <span
                className={`${css.heatmapLegendSwatch} ${css.swatchSome}`}
              />{" "}
              Some
            </span>
            <span className={css.heatmapLegendItem}>
              <span
                className={`${css.heatmapLegendSwatch} ${css.swatchNone}`}
              />{" "}
              None
            </span>
          </>
        ) : (
          <>
            <span className={css.heatmapLegendItem}>
              <span
                className={`${css.heatmapLegendSwatch} ${css.swatchAllPerformance}`}
              />{" "}
              Yes
            </span>
            <span className={css.heatmapLegendItem}>
              <span
                className={`${css.heatmapLegendSwatch} ${css.swatchNone}`}
              />{" "}
              None
            </span>
          </>
        )}
      </div>
    </div>
  );
}

interface CellNodeProps {
  cell: CellInfo;
  weekIdx: number;
  dayIdx: number;
  starWeek: number;
  starDay: number;
  type: "wellness" | "performance";
}

function CellNode({
  cell,
  weekIdx,
  dayIdx,
  starWeek,
  starDay,
  type,
}: CellNodeProps) {
  const isToday = weekIdx === starWeek && dayIdx === starDay;

  if (cell.state === "blank") {
    return <div className={`${css.heatmapCell} ${css.blank}`} />;
  }

  const dayNum = cell.date ? cell.date.getDate() : "";
  const dateLabel =
    cell.date !== null
      ? `${MONTH_NAMES_LONG[cell.date.getMonth()]} ${cell.date.getDate()}, ${cell.date.getFullYear()}`
      : "";
  const visuallyHiddenLabel = `${dateLabel}${isToday ? " (today)" : ""}: ${stateLabel(
    cell.state,
  )}`;

  // Tappable filter (load-bearing - both rules required):
  //   1. state !== 'inactive'
  //   2. offset is in [0, HISTORY] (i.e., not NaN, not future-dated)
  // AND only wellness cells are interactive in this story (performance
  // cells are non-interactive per requirements).
  const inWindow =
    !Number.isNaN(cell.offset) &&
    cell.offset >= 0 &&
    cell.offset <= HISTORY;
  const tappable =
    type === "wellness" && cell.state !== "inactive" && inWindow;

  const stateClass =
    cell.state === "all"
      ? css.all
      : cell.state === "some"
        ? css.partial
        : cell.state === "none"
          ? css.none
          : css.inactive;
  const todayClass = isToday ? css.today : "";
  const inertClass = tappable ? "" : css.heatmapCellInert;
  const className = `${css.heatmapCell} ${stateClass} ${todayClass} ${inertClass}`;

  if (tappable && cell.date) {
    const iso = toISO(cell.date);
    return (
      <Link to={`/wellness?date=${iso}`} className={className}>
        <span aria-hidden="true">{dayNum}</span>
        <span className={common.visuallyHidden}>{visuallyHiddenLabel}</span>
      </Link>
    );
  }

  // Inactive or performance cells: render as <div>. No role, no
  // tabindex. Still emit the visually-hidden label so screen-reader
  // traversal announces each day's date and state.
  return (
    <div className={className}>
      <span aria-hidden="true">{dayNum}</span>
      <span className={common.visuallyHidden}>{visuallyHiddenLabel}</span>
    </div>
  );
}

export const ActivityCalendar = memo(ActivityCalendarImpl);
