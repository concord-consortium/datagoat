import clsx from "clsx";
import type { MetricDefinition } from "../../metrics/types";
import { useNumericLocalString } from "./useNumericLocalString";
import css from "./NumericInput.module.css";

export interface NumericInputProps {
  metric: MetricDefinition;
  value: string;
  onChange: (next: string) => void;
  labelledBy: string;
  // Forwarded to useNumericLocalString. Set when the metric's y-axis
  // range goes below 0 (custom metrics with `yBottomRaw < 0`).
  allowNegative?: boolean;
}

export function NumericInput({
  metric,
  value,
  onChange,
  labelledBy,
  allowNegative,
}: NumericInputProps) {
  const { local, handleChange, handleCompositionEnd } = useNumericLocalString(
    value,
    onChange,
    allowNegative,
  );
  const filled = local !== "";
  // Prefer the short-form displayUnit ("hr", "g") in the log column;
  // metric.unit's long form ("hr/night", "g/kg/day") is reserved for
  // MetricDetail and info screens. "level" sentinel suppresses unit
  // suffix (used by colorScale rows like Hydration which never reach
  // this branch but kept for safety).
  const shortUnit = metric.displayUnit ?? metric.unit;
  return (
    <>
      <div className={css.recordCell}>
        <input
          type="text"
          inputMode="decimal"
          className={clsx(css.recordInput, filled && css.hasValue)}
          value={local}
          onChange={handleChange}
          onCompositionEnd={handleCompositionEnd}
          aria-labelledby={labelledBy}
        />
        {shortUnit && shortUnit !== "level" && (
          <span className={css.fieldUnit}>{shortUnit}</span>
        )}
      </div>
      {metric.hint && <div className={css.fieldHint}>{metric.hint}</div>}
    </>
  );
}
