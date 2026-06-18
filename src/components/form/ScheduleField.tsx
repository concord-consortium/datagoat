import { useState } from "react";
import { SelectField, type SelectOption } from "./SelectField";
import { TextField } from "./TextField";
import { If } from "../common/If";
import {
  normalizedCount,
  type MetricSchedule,
  type SchedulePeriod,
} from "../../types/metricSchedule";
import css from "./ScheduleField.module.css";

export interface ScheduleFieldProps {
  value: MetricSchedule;
  onChange: (next: MetricSchedule) => void;
  // Disambiguates input ids when two ScheduleFields could share a page.
  idPrefix?: string;
}

const PERIOD_OPTIONS: SelectOption[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "irregular", label: "Irregular (no reminders)" },
];

// Noun used in the count field's label ("Times per week").
const PERIOD_NOUN: Record<Exclude<SchedulePeriod, "irregular">, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

// Coerce the count text buffer to the canonical positive integer the
// schedule will carry; blank / fractional / zero / negative all become 1.
// Uses the shared normalizedCount rule so the editor agrees with the
// Firestore boundaries, the formatter, and equality.
function countFromText(period: SchedulePeriod, text: string): number {
  return normalizedCount(period, Number(text)) ?? 1;
}

// Controlled editor for a MetricSchedule: a period dropdown plus a
// "times per <period>" count that appears only for periodic schedules
// (irregular has no count). Basic v1 UI - the richer multi-frequency
// design (DGT-54 stretch goal) can replace it without touching callers.
export function ScheduleField({
  value,
  onChange,
  idPrefix = "schedule",
}: ScheduleFieldProps) {
  const periodic = value.period !== "irregular";
  // Local text buffer for the count input. Owning the raw string (rather
  // than deriving it from value.count every render) lets the user clear
  // the field and type freely without each keystroke snapping back to a
  // normalized number, and it preserves the last count across an
  // irregular round-trip (the schedule object drops count while the
  // period is irregular).
  const [countText, setCountText] = useState(String(value.count ?? 1));

  function handlePeriodChange(next: SchedulePeriod) {
    if (next === "irregular") {
      onChange({ period: "irregular" });
    } else {
      // Restore the count from the buffer so switching away from and back
      // to a periodic schedule doesn't silently reset it to 1.
      onChange({ period: next, count: countFromText(next, countText) });
    }
  }

  function handleCountChange(raw: string) {
    setCountText(raw);
    if (value.period === "irregular") return;
    onChange({ period: value.period, count: countFromText(value.period, raw) });
  }

  // On blur, reflect the canonical value back into the field so an empty
  // or invalid in-progress entry resolves to the count actually stored.
  function handleCountBlur() {
    if (value.period === "irregular") return;
    setCountText(String(countFromText(value.period, countText)));
  }

  return (
    // role="group" ties the period select and its count together for
    // assistive tech, so the "Times per <period>" field is announced as
    // part of the schedule rather than a stray, separately-labelled input.
    <div className={css.row} role="group" aria-label="Metric schedule">
      <SelectField
        id={`${idPrefix}-period`}
        label="Schedule"
        options={PERIOD_OPTIONS}
        value={value.period}
        onChange={(e) => handlePeriodChange(e.target.value as SchedulePeriod)}
      />
      <If condition={periodic}>
        <TextField
          id={`${idPrefix}-count`}
          label={`Times per ${
            value.period === "irregular" ? "" : PERIOD_NOUN[value.period]
          }`}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={countText}
          onChange={(e) => handleCountChange(e.target.value)}
          onBlur={handleCountBlur}
        />
      </If>
    </div>
  );
}
