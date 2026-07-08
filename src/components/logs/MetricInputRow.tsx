import {
  useCallback,
  useId,
  useRef,
  type KeyboardEvent,
} from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import type { MetricDefinition } from "../../metrics/types";
import { AvailabilityTree } from "./AvailabilityTree";
import { NumericInput } from "./NumericInput";
import type { HealthEntry } from "../../types/data";
import type { CustomMetricLevel } from "../../types/customMetrics";
import { OrdinalRadioGroup } from "./OrdinalRadioGroup";
import { If } from "../common/If";
import { MetricSparkline } from "../../charts/MetricSparkline";
import css from "./MetricInputRow.module.css";

import { HYDRATION_HEXES } from "../../data/hydrationColors";

interface BaseProps {
  metric: MetricDefinition;
  // Average label rendered in the leftmost cell. Optional - the parent
  // computes this from history; absence renders an em-dash.
  avgLabel?: string;
  // Detail link target (e.g., "/health/hydration").
  detailHref?: string;
  // Optional 7-day summary shown in the leftmost cell (Health entry page): a
  // mini bar sparkline (goal-colored via `sparklineGoal`) above the average.
  sparklineData?: Array<{ date: string; value: number | null }>;
  sparklineGoal?: number;
}

export interface NumericMetricInputRowProps extends BaseProps {
  inputType: "numeric";
  value: string;
  onChange: (next: string) => void;
  // Forwarded to NumericInput. Set when the metric's y-axis range
  // goes below 0 (custom metrics with `yBottomRaw < 0`).
  allowNegative?: boolean;
}

export interface ColorScaleMetricInputRowProps extends BaseProps {
  inputType: "colorScale";
  value: number | undefined;
  onChange: (next: number) => void;
}

export interface TreeMetricInputRowProps extends BaseProps {
  inputType: "tree";
  competitionTerm: string;
  value: HealthEntry["availability"];
  onChange: (next: HealthEntry["availability"]) => void;
}

export interface OrdinalMetricInputRowProps extends BaseProps {
  inputType: "ordinal";
  levels: CustomMetricLevel[];
  value: number | undefined;
  onChange: (next: number) => void;
}

export type MetricInputRowProps =
  | NumericMetricInputRowProps
  | ColorScaleMetricInputRowProps
  | TreeMetricInputRowProps
  | OrdinalMetricInputRowProps;

// Single row for a tracked health metric. Switches on metric.inputType.
export function MetricInputRow(props: MetricInputRowProps) {
  const { metric, avgLabel, detailHref, sparklineData, sparklineGoal } = props;
  const nameId = useId();
  return (
    <tr className={css.metricInputRow}>
      <td>
        <div className={css.trackCell}>
          <If condition={sparklineData !== undefined}>
            <MetricSparkline
              metricId={metric.id}
              data={sparklineData!}
              goalRaw={sparklineGoal}
            />
          </If>
          <span className={css.avgValue}>{avgLabel ?? "—"}</span>
        </div>
      </td>
      <td id={nameId} className={css.metricName}>
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
            labelledBy={nameId}
            allowNegative={props.allowNegative}
          />
        )}
        {props.inputType === "colorScale" && (
          <ColorScale
            metric={metric}
            value={props.value}
            onChange={props.onChange}
            labelledBy={nameId}
          />
        )}
        {props.inputType === "tree" && (
          <AvailabilityTree
            competitionTerm={props.competitionTerm}
            value={props.value}
            onChange={props.onChange}
            labelledBy={nameId}
          />
        )}
        {props.inputType === "ordinal" && (
          <OrdinalRadioGroup
            levels={props.levels}
            value={props.value}
            onChange={props.onChange}
            labelledBy={nameId}
          />
        )}
      </td>
    </tr>
  );
}

interface ColorScaleProps {
  metric: MetricDefinition;
  value: number | undefined;
  onChange: (next: number) => void;
  labelledBy: string;
}

// Color-swatch picker for hydration. Per spec contract:
//   - each swatch is a focusable <button> with aria-pressed for selected
//   - arrow Left/Right (and Up/Down) MOVE focus AND fire the change in one
//     step (not just-focus); number keys 1-N jump directly
//   - selected swatch gets aria-pressed='true' + the .selected class
function ColorScale({ metric, value, onChange, labelledBy }: ColorScaleProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const max = metric.max ?? 8;
  const swatchValues = HYDRATION_HEXES.slice(0, max);

  // True when no swatch is selected. A fresh entry has undefined
  // hydration. Per DGT-53 the model is "undefined === not logged" and
  // any other finite number is valid data; the hydration UI cannot
  // produce 0, and value validation for metric-specific ranges
  // (hydration `min: 1`) is deferred to the upcoming categorical-
  // metrics work that owns the metric definitions.
  const noSelection = value === undefined;

  const select = useCallback(
    (next: number) => {
      if (next < 1 || next > max) return;
      if (next === value) return;
      onChange(next);
      // Focus the newly-selected swatch so the keyboard contract advances.
      const node = refs.current[next - 1];
      if (node) node.focus();
    },
    [max, value, onChange],
  );

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      // idx is 0-based, swatch values are 1..max; clamp at the right edge.
      const next = Math.min(max, idx + 2);
      select(next);
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      // Left edge: stay on the current swatch (no wraparound).
      const next = Math.max(1, idx);
      select(next);
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
      aria-labelledby={labelledBy}
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
            className={clsx(
              css.colorSwatch,
              css.swatchDark,
              selected && css.selected,
            )}
            style={{ background: bg }}
            aria-label={`${level} of ${max}`}
            aria-pressed={selected}
            tabIndex={selected || (noSelection && idx === 0) ? 0 : -1}
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
