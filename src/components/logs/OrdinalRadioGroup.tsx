import { useId } from "react";
import type { CustomMetricLevel } from "../../types/customMetrics";
import css from "./OrdinalRadioGroup.module.css";

export interface OrdinalRadioGroupProps {
  levels: CustomMetricLevel[];
  value: number | undefined;
  onChange: (next: number) => void;
  // For accessibility - the id of the element that names this group.
  labelledBy: string;
}

export function OrdinalRadioGroup({
  levels,
  value,
  onChange,
  labelledBy,
}: OrdinalRadioGroupProps) {
  const groupName = useId();
  return (
    <div
      className={css.ordinalGroup}
      role="radiogroup"
      aria-labelledby={labelledBy}
    >
      {levels.map((level) => {
        if (level.value === undefined) return null;
        const checked = value === level.value;
        return (
          <label key={level.value} className={css.ordinalOption}>
            <input
              type="radio"
              name={groupName}
              checked={checked}
              onChange={() => onChange(level.value as number)}
            />
            {level.label}
          </label>
        );
      })}
    </div>
  );
}
