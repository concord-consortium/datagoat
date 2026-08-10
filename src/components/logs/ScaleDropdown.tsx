import type { CustomMetricLevel } from "../../types/customMetrics";
import { SelectField, type SelectOption } from "../form/SelectField";

export interface ScaleDropdownProps {
  // Ordered levels (label + numeric value). Option order follows this array.
  levels: CustomMetricLevel[];
  // Currently-selected level value; undefined = nothing logged yet.
  value: number | undefined;
  onChange: (next: number) => void;
  // Accessible name for the control (the metric name); rendered visually
  // hidden since the log row already shows the name in its own cell.
  label: string;
  // Shown as the disabled first option when nothing is selected yet.
  placeholder?: string;
}

// Visible text for one option: "<value> – <description>", or just the number
// when the level has no description (the unlabeled rungs of the exertion /
// fatigue scales). The stored value is always the numeric level.
function optionText(level: CustomMetricLevel): string {
  return level.label ? `${level.value} – ${level.label}` : String(level.value);
}

// A dropdown picker for ordinal/scale metrics flagged scaleDisplay: "dropdown".
// Chosen over ScaleCards for 0–10 scales whose rungs carry descriptions too
// long to read as a card row. Wraps the shared SelectField primitive (label
// association, aria wiring, dark-theme styling) and stores the numeric level,
// so it is interchangeable with ScaleCards on the same tracked value.
export function ScaleDropdown({
  levels,
  value,
  onChange,
  label,
  placeholder = "Select…",
}: ScaleDropdownProps) {
  const options: SelectOption[] = levels.map((level) => ({
    value: String(level.value),
    label: optionText(level),
  }));
  return (
    <SelectField
      label={label}
      labelVisuallyHidden
      options={options}
      placeholder={placeholder}
      value={value === undefined ? "" : String(value)}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "") return;
        onChange(Number(next));
      }}
    />
  );
}
