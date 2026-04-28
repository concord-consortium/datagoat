import {
  useCallback,
  useId,
  useRef,
  type ChangeEventHandler,
  type KeyboardEvent,
} from "react";
import { Link } from "react-router-dom";
import type { MetricDefinition } from "../../metrics/types";
import { AvailabilityTree } from "./AvailabilityTree";
import type { WellnessEntry } from "../../types/data";
import css from "./MetricInputRow.module.css";

// Hydration color-scale palette - prototype line 6725.
const HYDRATION_HEXES = [
  "#F9F7DA",
  "#FFFAC7",
  "#FFF585",
  "#FFF234",
  "#FFEE70",
  "#FFEA41",
  "#DBC37A",
  "#A7944B",
];

interface BaseProps {
  metric: MetricDefinition;
  // Average label rendered in the leftmost cell. Optional - the parent
  // computes this from history; absence renders an em-dash.
  avgLabel?: string;
  // Detail link target (e.g., "/wellness/hydration").
  detailHref?: string;
}

export interface NumericMetricInputRowProps extends BaseProps {
  inputType: "numeric";
  value: string;
  onChange: (next: string) => void;
}

export interface ColorScaleMetricInputRowProps extends BaseProps {
  inputType: "colorScale";
  value: number;
  onChange: (next: number) => void;
}

export interface TreeMetricInputRowProps extends BaseProps {
  inputType: "tree";
  competitionTerm: string;
  value: WellnessEntry["availability"];
  onChange: (next: WellnessEntry["availability"]) => void;
}

export type MetricInputRowProps =
  | NumericMetricInputRowProps
  | ColorScaleMetricInputRowProps
  | TreeMetricInputRowProps;

// Single row for a tracked wellness metric. Switches on metric.inputType.
export function MetricInputRow(props: MetricInputRowProps) {
  const { metric, avgLabel, detailHref } = props;
  return (
    <tr className={css.metricInputRow}>
      <td>
        <div className={css.trackCell}>{avgLabel ?? "—"}</div>
      </td>
      <td className={css.metricName}>
        {detailHref ? (
          <Link to={detailHref} className={css.metricLink}>
            {metric.name}
          </Link>
        ) : (
          metric.name
        )}
      </td>
      <td>
        {props.inputType === "numeric" && (
          <NumericInput
            metric={metric}
            value={props.value}
            onChange={props.onChange}
          />
        )}
        {props.inputType === "colorScale" && (
          <ColorScale
            metric={metric}
            value={props.value}
            onChange={props.onChange}
          />
        )}
        {props.inputType === "tree" && (
          <AvailabilityTree
            competitionTerm={props.competitionTerm}
            value={props.value}
            onChange={props.onChange}
          />
        )}
      </td>
    </tr>
  );
}

interface NumericInputProps {
  metric: MetricDefinition;
  value: string;
  onChange: (next: string) => void;
}
function NumericInput({ metric, value, onChange }: NumericInputProps) {
  const reactId = useId();
  const handleChange: ChangeEventHandler<HTMLInputElement> = (e) =>
    onChange(e.target.value);
  const filled = value !== "" && value != null;
  return (
    <div className={css.recordCell}>
      <input
        id={reactId}
        type="text"
        inputMode="decimal"
        className={`${css.recordInput} ${filled ? css.hasValue : ""}`}
        value={value}
        onChange={handleChange}
        aria-label={metric.name}
        placeholder={metric.unit}
      />
      {metric.unit && metric.unit !== "level" && (
        <span className={css.fieldUnit}>{metric.unit}</span>
      )}
    </div>
  );
}

interface ColorScaleProps {
  metric: MetricDefinition;
  value: number;
  onChange: (next: number) => void;
}

// Color-swatch picker for hydration. Per spec contract:
//   - each swatch is a focusable <button> with aria-pressed for selected
//   - arrow Left/Right (and Up/Down) MOVE focus AND fire the change in one
//     step (not just-focus); number keys 1-N jump directly
//   - selected swatch gets aria-pressed='true' + the .selected class
function ColorScale({ metric, value, onChange }: ColorScaleProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const max = metric.max ?? 8;
  const swatchValues = HYDRATION_HEXES.slice(0, max);

  const select = useCallback(
    (next: number) => {
      if (next < 1 || next > max) return;
      onChange(next);
      // Focus the newly-selected swatch so the keyboard contract advances.
      const node = refs.current[next - 1];
      if (node) node.focus();
    },
    [max, onChange],
  );

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      select(idx + 2);
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      select(idx);
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      const n = Number(e.key);
      if (n >= 1 && n <= max) {
        e.preventDefault();
        select(n);
      }
      return;
    }
  }

  return (
    <div
      className={css.colorScale}
      role="radiogroup"
      aria-label={`${metric.name} level`}
    >
      {swatchValues.map((bg, idx) => {
        const level = idx + 1;
        const selected = value === level;
        return (
          <button
            key={level}
            ref={(node) => {
              refs.current[idx] = node;
            }}
            type="button"
            className={`${css.colorSwatch} ${css.swatchDark} ${selected ? css.selected : ""}`}
            style={{ background: bg }}
            aria-label={`${metric.name}: ${level} of ${max}`}
            aria-pressed={selected}
            tabIndex={selected || (value === 0 && idx === 0) ? 0 : -1}
            onClick={() => select(level)}
            onKeyDown={(e) => onKeyDown(e, idx)}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}
