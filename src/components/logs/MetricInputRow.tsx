import { useId, useMemo } from "react";
import { Link } from "react-router-dom";
import type { MetricDefinition } from "../../metrics/types";
import { AvailabilityTree } from "./AvailabilityTree";
import { NumericInput } from "./NumericInput";
import type { HealthEntry } from "../../types/data";
import type { CustomMetricLevel } from "../../types/customMetrics";
import { ScaleCards } from "./ScaleCards";
import { LevelRadioGroup } from "./LevelRadioGroup";
import { resolveScaleColors } from "../../data/scaleColors";
import { MoodFace } from "../../icons/MoodFace";
import css from "./MetricInputRow.module.css";

interface BaseProps {
  metric: MetricDefinition;
  // Average label rendered in the leftmost cell. Optional - the parent
  // computes this from history; absence renders an em-dash.
  avgLabel?: string;
  // Detail link target (e.g., "/health/hydration").
  detailHref?: string;
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

export interface RadioMetricInputRowProps extends BaseProps {
  // Plain radio group (e.g. Yes/No metrics) rather than the scale-card picker.
  inputType: "radio";
  levels: CustomMetricLevel[];
  value: number | undefined;
  onChange: (next: number) => void;
}

export type MetricInputRowProps =
  | NumericMetricInputRowProps
  | ColorScaleMetricInputRowProps
  | TreeMetricInputRowProps
  | OrdinalMetricInputRowProps
  | RadioMetricInputRowProps;

// Single row for a tracked health metric. Switches on metric.inputType.
export function MetricInputRow(props: MetricInputRowProps) {
  const { metric, avgLabel, detailHref } = props;
  const nameId = useId();
  // Hydration (colorScale) renders through ScaleCards with synthetic 1..max
  // levels; the numeric labels double as the card text and drive the default
  // "<i+1> of <n>" aria-label.
  const hydrationLevels = useMemo<CustomMetricLevel[]>(
    () =>
      Array.from({ length: metric.max ?? 8 }, (_, i) => ({
        label: String(i + 1),
        value: i + 1,
      })),
    [metric.max],
  );
  return (
    <tr className={css.metricInputRow}>
      <td>
        <div className={css.trackCell}>{avgLabel ?? "—"}</div>
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
          <ScaleCards
            levels={hydrationLevels}
            colors={resolveScaleColors({ metricId: metric.id, levels: hydrationLevels })}
            value={props.value}
            onChange={props.onChange}
            labelledBy={nameId}
            ariaLabelFormat={(i, n) => `${i + 1} of ${n}`}
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
          <ScaleCards
            levels={props.levels}
            colors={resolveScaleColors({ metricId: metric.id, levels: props.levels })}
            value={props.value}
            onChange={props.onChange}
            labelledBy={nameId}
            // Mood shows an outline face icon per card; the level word is the
            // card's accessible name (the icon itself is decorative).
            renderLabel={
              metric.id === "mood"
                ? (level) => <MoodFace value={level.value ?? 3} />
                : undefined
            }
            ariaLabelFormat={
              metric.id === "mood" ? (_i, _n, level) => level.label : undefined
            }
          />
        )}
        {props.inputType === "radio" && (
          <LevelRadioGroup
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
