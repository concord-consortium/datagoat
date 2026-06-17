import { SelectField, type SelectOption } from "./SelectField";
import { TextField } from "./TextField";
import { If } from "../common/If";
import type {
  MetricSchedule,
  SchedulePeriod,
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

// Controlled editor for a MetricSchedule: a period dropdown plus a
// "times per <period>" count that appears only for periodic schedules
// (irregular has no count). Basic v1 UI — the richer multi-frequency
// design (DGT-54 stretch goal) can replace it without touching callers.
export function ScheduleField({
  value,
  onChange,
  idPrefix = "schedule",
}: ScheduleFieldProps) {
  const periodic = value.period !== "irregular";
  const count = value.count ?? 1;

  function handlePeriodChange(next: SchedulePeriod) {
    if (next === "irregular") {
      onChange({ period: "irregular" });
    } else {
      onChange({ period: next, count });
    }
  }

  function handleCountChange(raw: string) {
    if (value.period === "irregular") return;
    const n = Math.floor(Number(raw));
    onChange({
      period: value.period,
      count: Number.isFinite(n) && n >= 1 ? n : 1,
    });
  }

  return (
    <div className={css.row}>
      <SelectField
        id={`${idPrefix}-period`}
        label="Schedule"
        options={PERIOD_OPTIONS}
        value={value.period}
        onChange={(e) =>
          handlePeriodChange(e.target.value as SchedulePeriod)
        }
      />
      <If condition={periodic}>
        <TextField
          id={`${idPrefix}-count`}
          label={`Times per ${
            periodic ? PERIOD_NOUN[value.period as keyof typeof PERIOD_NOUN] : ""
          }`}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={String(count)}
          onChange={(e) => handleCountChange(e.target.value)}
        />
      </If>
    </div>
  );
}
