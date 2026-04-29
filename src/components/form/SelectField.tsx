import { forwardRef, useId, type Ref } from "react";
import { Link } from "react-router-dom";
import ChevronDownIcon from "@/icons/chevron-down.svg?react";
import InfoCircleIcon from "@/icons/info-circle.svg?react";
import fields from "./fields.module.css";
import css from "./SelectField.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  id?: string;
  label: string;
  options: SelectOption[];
  required?: boolean;
  error?: string;
  hint?: string;
  // When set, render an info icon button that links to /info/<infoTopic>.
  infoTopic?: string;
  infoLabel?: string;
  placeholder?: string;
  // Driving the .has-value declarative toggle (parallel to TextField).
  value?: string;
  hasValue?: boolean;
  defaultValue?: string;
  // RHF-compatible
  name?: string;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  onBlur?: React.FocusEventHandler<HTMLSelectElement>;
  disabled?: boolean;
}

// Native HTML <select> per the Step-9 spec decision. The prototype's
// .custom-select / drop-up family is intentionally NOT ported - native select
// inherits platform keyboard/SR/touch-keyboard behaviors for free.
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField(
    {
      id,
      label,
      options,
      required,
      error,
      hint,
      infoTopic,
      infoLabel,
      placeholder = "Select …",
      value,
      hasValue,
      defaultValue,
      name,
      onChange,
      onBlur,
      disabled,
    }: SelectFieldProps,
    ref: Ref<HTMLSelectElement>,
  ) {
    const reactId = useId();
    const selectId = id ?? `sf-${reactId}`;
    const errorId = error ? `${selectId}-error` : undefined;
    const hintId = hint ? `${selectId}-hint` : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
    const filled =
      hasValue ??
      (typeof value === "string" ? value.length > 0 : false);

    const selectCls = [
      fields.fieldSelect,
      filled ? fields.hasValue : "",
      error ? fields.fieldError : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={fields.fieldWrap}>
        <label className={fields.fieldLabel} htmlFor={selectId}>
          {label}
          {required && (
            <span className={fields.requiredMark} aria-hidden="true">
              *
            </span>
          )}
        </label>
        <div className={css.selectWithInfo}>
          <div className={css.selectInner}>
            <select
              ref={ref}
              id={selectId}
              name={name ?? selectId}
              className={selectCls}
              aria-required={required || undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              value={value}
              defaultValue={defaultValue}
              onChange={onChange}
              onBlur={onBlur}
              disabled={disabled}
            >
              <option value="" disabled>
                {placeholder}
              </option>
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className={css.chevron} aria-hidden="true" />
          </div>
          {infoTopic && (
            <Link
              to={`/info/${infoTopic}`}
              className={fields.fieldInfoBtn}
              aria-label={infoLabel ?? `${label} info`}
            >
              <InfoCircleIcon />
            </Link>
          )}
        </div>
        {error && (
          <p id={errorId} className={fields.fieldErrorMsg} role="alert">
            {error}
          </p>
        )}
        {hint && (
          <p id={hintId} className={fields.fieldHint}>
            {hint}
          </p>
        )}
      </div>
    );
  },
);
