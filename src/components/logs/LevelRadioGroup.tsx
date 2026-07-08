import { useId } from "react";
import type { CustomMetricLevel } from "../../types/customMetrics";
import radioCss from "../form/RadioGroup.module.css";
import css from "./LevelRadioGroup.module.css";

export interface LevelRadioGroupProps {
  levels: CustomMetricLevel[];
  value: number | undefined;
  onChange: (next: number) => void;
  // For accessibility - the id of the element that names this group.
  labelledBy: string;
}

// Plain radio-button group over a metric's levels. Used for Yes/No metrics,
// which stay simple radios rather than the scale-card picker.
export function LevelRadioGroup({
  levels,
  value,
  onChange,
  labelledBy,
}: LevelRadioGroupProps) {
  const groupName = useId();
  return (
    <div className={css.group} role="radiogroup" aria-labelledby={labelledBy}>
      {levels.map((level, idx) => {
        if (level.value === undefined) return null;
        const checked = value === level.value;
        return (
          <label key={`${idx}-${level.value}`} className={css.option}>
            <input
              type="radio"
              className={radioCss.radio}
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
