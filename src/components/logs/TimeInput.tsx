import { useEffect, useState } from "react";
import clsx from "clsx";
import type { MetricDefinition } from "../../metrics/types";
import {
  resolveTimeLayout,
  parseTimeToDecimal,
  formatDecimalToFields,
  isAllEmpty,
  layoutUnits,
  type TimeFields,
  type TimeUnit,
} from "../../utils/timeValue";
import css from "./TimeInput.module.css";

export interface TimeInputProps {
  metric: MetricDefinition;
  value: string;
  onChange: (next: string) => void;
  labelledBy: string;
  // Decimal places shown in the seconds field on blur-normalization.
  // Defaults to 2; the log passes the metric's configured value.
  secondsDecimals?: number;
}

// Visible + accessible unit labels. The prototype labels each field with
// its unit ("hr" / "min") rather than separating fields with a colon, and
// repeats the unit as gray placeholder text inside the empty field.
const UNIT_LABEL: Record<TimeUnit, string> = { h: "hr", m: "min", s: "sec" };

const AMBIGUOUS_ERROR =
  "Enter a whole number in the larger field, or use the smaller field.";

function seed(value: string, layout: ReturnType<typeof resolveTimeLayout>, secondsDecimals: number): TimeFields {
  if (!layout) return {};
  const n = value === "" ? NaN : Number(value);
  if (!Number.isFinite(n)) return {};
  return formatDecimalToFields(n, layout, secondsDecimals);
}

export function TimeInput({
  metric,
  value,
  onChange,
  labelledBy,
  secondsDecimals = 2,
}: TimeInputProps) {
  const layout = resolveTimeLayout(metric);
  const [fields, setFields] = useState<TimeFields>(() => seed(value, layout, secondsDecimals));
  const [error, setError] = useState<string | null>(null);

  // Reconcile from the parent only when it changes to a value that
  // doesn't round-trip to the current fields (cross-tab edit, reset).
  useEffect(() => {
    if (!layout) return;
    const current = parseTimeToDecimal(fields, layout);
    const parent = value === "" ? null : Number(value);
    const same =
      (parent === null && current === null) ||
      (parent !== null && current !== null && Math.abs(parent - current) < 1e-9);
    if (!same) setFields(seed(value, layout, secondsDecimals));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!layout) return null;
  const units = layoutUnits(layout);

  // Resolve a candidate `next` fields object against the shared
  // empty/parse/error contract: fire "" when cleared, fire
  // String(decimal) when valid, else hold locally with an error.
  function commit(next: TimeFields) {
    setFields(next);
    if (isAllEmpty(next, layout!)) {
      setError(null);
      onChange("");
      return;
    }
    const parsed = parseTimeToDecimal(next, layout!);
    if (parsed === null) {
      setError(AMBIGUOUS_ERROR);
      return; // hold local, don't fire
    }
    setError(null);
    onChange(String(parsed));
  }

  function update(unit: TimeUnit, raw: string) {
    // Pasting "8:40" splits across the layout's fields (coarsest-first),
    // regardless of which field received the paste.
    if (raw.includes(":")) {
      const pieces = raw.split(":");
      const next = { ...fields };
      units.forEach((u, i) => {
        if (i < pieces.length) next[u] = pieces[i];
      });
      commit(next);
      return;
    }
    // Allow only digits and a single dot while typing.
    if (raw !== "" && !/^[0-9]*\.?[0-9]*$/.test(raw)) return;
    commit({ ...fields, [unit]: raw });
  }

  function normalizeOnBlur() {
    const parsed = parseTimeToDecimal(fields, layout!);
    if (parsed === null) return; // leave invalid state + error for the user to fix
    setError(null);
    setFields(formatDecimalToFields(parsed, layout!, secondsDecimals));
  }

  return (
    <div>
      <div className={css.timeInput} role="group" aria-labelledby={labelledBy}>
        {units.map((unit) => (
          <span key={unit} className={css.unitGroup}>
            <input
              type="text"
              inputMode="decimal"
              className={clsx(css.field, (fields[unit] ?? "") !== "" && css.hasValue)}
              value={fields[unit] ?? ""}
              placeholder={UNIT_LABEL[unit]}
              aria-label={`${metric.name} ${UNIT_LABEL[unit]}`}
              onChange={(e) => update(unit, e.target.value)}
              onBlur={normalizeOnBlur}
            />
            <span className={css.fieldUnit} aria-hidden="true">
              {UNIT_LABEL[unit]}
            </span>
          </span>
        ))}
      </div>
      {error && (
        <div className={css.error} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
