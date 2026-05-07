import clsx from "clsx";
import { useNumericLocalString } from "./useNumericLocalString";
import css from "./PerformanceMetricInput.module.css";

export interface PerformanceMetricInputProps {
  metricId: string;
  labelledBy: string;
  value: string;
  filled: boolean;
  onChange: (raw: string) => void;
}

export function PerformanceMetricInput({
  metricId,
  labelledBy,
  value,
  filled,
  onChange,
}: PerformanceMetricInputProps) {
  const { local, handleChange, handleCompositionEnd } = useNumericLocalString(value, onChange);
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
