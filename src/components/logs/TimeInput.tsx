import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { MetricDefinition } from "../../metrics/types";
import {
  formatDecimalToFields,
  hasTimeRangeError,
  isAllEmpty,
  layoutUnits,
  parseClockString,
  parseTimeToDecimal,
  resolveTimeLayout,
  type TimeFields,
  type TimeUnit,
} from "../../utils/timeValue";
import { If } from "../common/If";
import css from "./TimeInput.module.css";

export interface TimeInputProps {
  metric: MetricDefinition;
  value: string;
  onChange: (next: string) => void;
  labelledBy: string;
  // Decimal places shown in the seconds field on blur-normalization.
  // Defaults to 2; the log passes the metric's configured value.
  secondsDecimals?: number;
  // Optional current effective value shown as gray placeholder text in
  // the empty fields (e.g. the base y-axis bound the user is overriding),
  // mirroring the placeholder the plain-number TextField shows.
  placeholderValue?: number;
  // Notified whenever the field's validity flips. Lets a parent form
  // block submit while an in-progress entry is invalid instead of
  // silently saving the last-committed (stale) value.
  onErrorChange?: (hasError: boolean) => void;
}

// Visible + accessible unit labels. The prototype labels each field with
// its unit ("hr" / "min") rather than separating fields with a colon, and
// repeats the unit as gray placeholder text inside the empty field.
const UNIT_LABEL: Record<TimeUnit, string> = { h: "hr", m: "min", s: "sec" };

// Digits and a single optional dot, matching the non-negative filter in
// useNumericLocalString. Applied per keystroke except mid-IME-composition.
const NUMERIC_FIELD = /^[0-9]*\.?[0-9]*$/;

const AMBIGUOUS_ERROR =
  "Enter a whole number in the larger field, or use the smaller field.";
const RANGE_ERROR = "Minutes and seconds must each be less than 60.";

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
  placeholderValue,
  onErrorChange,
}: TimeInputProps) {
  const layout = resolveTimeLayout(metric);
  const [fields, setFields] = useState<TimeFields>(() => seed(value, layout, secondsDecimals));
  const [error, setError] = useState<string | null>(null);
  // Field value captured at composition start, so an IME composition that
  // ends on non-numeric input can be reverted without stalling the keyboard.
  const composeStart = useRef<string | null>(null);
  // Latest onErrorChange, so notifying doesn't depend on a stable callback.
  const onErrorChangeRef = useRef(onErrorChange);
  onErrorChangeRef.current = onErrorChange;

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
  const placeholderFields =
    placeholderValue !== undefined && Number.isFinite(placeholderValue)
      ? formatDecimalToFields(placeholderValue, layout, secondsDecimals)
      : null;

  // Set the error state and notify the parent of the validity flip.
  function applyError(next: string | null) {
    setError(next);
    onErrorChangeRef.current?.(next !== null);
  }

  // Resolve a candidate `next` fields object against the shared
  // empty/parse/error contract: fire "" when cleared, fire
  // String(decimal) when valid, else hold locally with an error.
  function commit(next: TimeFields) {
    setFields(next);
    if (isAllEmpty(next, layout!)) {
      applyError(null);
      onChange("");
      return;
    }
    const parsed = parseTimeToDecimal(next, layout!);
    if (parsed === null) {
      // Range violations and decimal-ambiguity both parse to null; show
      // the message that fits so the user knows how to fix it.
      applyError(hasTimeRangeError(next, layout!) ? RANGE_ERROR : AMBIGUOUS_ERROR);
      return; // hold local, don't fire
    }
    applyError(null);
    onChange(String(parsed));
  }

  // Interpret a pasted colon-delimited clock string across the whole
  // layout, converting it to the stored decimal. Right-aligns to the
  // finest field, so "1:30" into a seconds-only metric reads as 90s
  // instead of dropping ":30".
  function commitClock(raw: string, unit: TimeUnit) {
    const parsed = parseClockString(raw, layout!);
    if (parsed === null) {
      setFields({ ...fields, [unit]: raw });
      applyError(AMBIGUOUS_ERROR);
      return;
    }
    applyError(null);
    setFields(formatDecimalToFields(parsed, layout!, secondsDecimals));
    onChange(String(parsed));
  }

  function update(unit: TimeUnit, raw: string, isComposing: boolean) {
    if (raw.includes(":")) {
      commitClock(raw, unit);
      return;
    }
    // Let in-flight IME composition through unfiltered; filtering mid-
    // composition stalls Android/AT keyboards. handleCompositionEnd
    // validates the committed string.
    if (isComposing) {
      setFields({ ...fields, [unit]: raw });
      return;
    }
    // Allow only digits and a single dot while typing.
    if (raw !== "" && !NUMERIC_FIELD.test(raw)) return;
    commit({ ...fields, [unit]: raw });
  }

  function handleCompositionEnd(unit: TimeUnit, raw: string) {
    const prev = composeStart.current ?? "";
    composeStart.current = null;
    if (raw.includes(":")) {
      commitClock(raw, unit);
      return;
    }
    if (raw !== "" && !NUMERIC_FIELD.test(raw)) {
      // Composed to something non-numeric — revert this field rather than
      // committing garbage.
      setFields({ ...fields, [unit]: prev });
      return;
    }
    commit({ ...fields, [unit]: raw });
  }

  function normalizeOnBlur() {
    const parsed = parseTimeToDecimal(fields, layout!);
    if (parsed === null) return; // leave invalid state + error for the user to fix
    applyError(null);
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
              placeholder={placeholderFields?.[unit] ?? UNIT_LABEL[unit]}
              aria-label={`${metric.name} ${UNIT_LABEL[unit]}`}
              onChange={(e) =>
                update(
                  unit,
                  e.target.value,
                  (e.nativeEvent as InputEvent).isComposing,
                )
              }
              onCompositionStart={() => {
                composeStart.current = fields[unit] ?? "";
              }}
              onCompositionEnd={(e) =>
                handleCompositionEnd(unit, e.currentTarget.value)
              }
              onBlur={normalizeOnBlur}
            />
            <span className={css.fieldUnit} aria-hidden="true">
              {UNIT_LABEL[unit]}
            </span>
          </span>
        ))}
      </div>
      <If condition={error !== null}>
        <div className={css.error} role="alert">
          {error}
        </div>
      </If>
    </div>
  );
}
