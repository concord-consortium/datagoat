import clsx from "clsx";
import { useNumericLocalString } from "./useNumericLocalString";
import css from "./PerformanceMetricInput.module.css";

export interface PerformanceMetricInputProps {
  metricId: string;
  labelledBy: string;
  value: string;
  filled: boolean;
  onChange: (raw: string) => void;
  // Forwarded to useNumericLocalString. Set when the metric's y-axis
  // range goes below 0 (custom metrics with `yBottomRaw < 0`).
  allowNegative?: boolean;
}

export function PerformanceMetricInput({
  metricId,
  labelledBy,
  value,
  filled,
  onChange,
  allowNegative,
}: PerformanceMetricInputProps) {
  const { local, handleChange, handleCompositionEnd } = useNumericLocalString(
    value,
    onChange,
    allowNegative,
  );
  return (
    <input
      type="text"
      inputMode="decimal"
      className={clsx(css.valueInput, filled && css.hasValue)}
      value={local}
      onChange={handleChange}
      onCompositionEnd={handleCompositionEnd}
      aria-labelledby={labelledBy}
      data-metric-id={metricId}
    />
  );
}
