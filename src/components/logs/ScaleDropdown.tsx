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
  // Omitted => SelectField's shared default, so the log row reads the same
  // as every other select in the app.
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
  placeholder,
}: ScaleDropdownProps) {
  // Guard against levels without a numeric value (nominal levels omit it):
  // they can't be a valid ordinal selection, and would otherwise render an
  // option whose value parses to NaN.
  const options: SelectOption[] = levels
    .filter((level) => Number.isFinite(level.value))
    .map((level) => ({
      value: String(level.value),
      label: optionText(level),
    }));
  // A stored value matching no level reads as "nothing selected", the same
  // way ScaleCards treats a findIndex miss. Passing it through would let
  // React's controlled-select fall back to the first option, showing a rung
  // the athlete never picked as though they had.
  const asString = value === undefined ? "" : String(value);
  const selected = options.some((o) => o.value === asString) ? asString : "";
  return (
    <SelectField
      label={label}
      labelVisuallyHidden
      options={options}
      placeholder={placeholder}
      value={selected}
      onChange={(e) => {
        const next = Number(e.target.value);
        if (!Number.isFinite(next)) return;
        onChange(next);
      }}
    />
  );
}
