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
  const { local, handleChange } = useNumericLocalString(value, onChange);
  return (
    <input
      type="text"
      inputMode="decimal"
      className={`${css.valueInput} ${filled ? css.hasValue : ""}`}
      value={local}
      onChange={handleChange}
      aria-labelledby={labelledBy}
      data-metric-id={metricId}
    />
  );
}
