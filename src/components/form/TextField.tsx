import { forwardRef, useId, type Ref } from "react";
import clsx from "clsx";
import fields from "./fields.module.css";
import common from "../common.module.css";

export interface TextFieldProps {
  id?: string;
  label: string;
  type?: "text" | "email" | "tel" | "number" | "url";
  required?: boolean;
  error?: string;
  hint?: string;
  autoComplete?: string;
  inputMode?: "text" | "decimal" | "numeric" | "tel" | "email" | "url";
  pattern?: string;
  maxLength?: number;
  // type="number" attrs - forwarded onto the <input>. min/max default to
  // unset (no enforcement); step defaults to "any".
  min?: number | string;
  max?: number | string;
  step?: number | string;
  placeholder?: string;
  short?: boolean;
  ariaLabel?: string;
  labelVisuallyHidden?: boolean;
  // For controlled or RHF-uncontrolled use - the component reads this to drive
  // the .has-value declarative toggle. When omitted, the consumer is expected
  // to manage value externally and pass `hasValue` directly.
  value?: string;
  hasValue?: boolean;
  // RHF-compatible props that get forwarded onto the <input>
  name?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  defaultValue?: string;
  disabled?: boolean;
}

// Wraps the prototype's <div class="field-wrap"> markup pattern. Consumes the
// shared form/fields.module.css; no new classes here.
//
// .has-value runtime toggle (load-bearing): the prototype attached a global
// `input` listener to toggle .has-value on every .field-input; the React
// equivalent is declarative - we drive the class from value or hasValue prop.
//
// A11y wiring: id matches <label htmlFor>, aria-invalid reflects error,
// aria-describedby links to error + hint ids, error <p> uses role="alert".
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      id,
      label,
      type = "text",
      required,
      error,
      hint,
      autoComplete,
      inputMode,
      pattern,
      maxLength,
      min,
      max,
      step,
      placeholder,
      short,
      ariaLabel,
      labelVisuallyHidden,
      value,
      hasValue,
      name,
      onChange,
      onBlur,
      onFocus,
      defaultValue,
      disabled,
    }: TextFieldProps,
    ref: Ref<HTMLInputElement>,
  ) {
    const reactId = useId();
    const inputId = id ?? `tf-${reactId}`;
    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
    const filled =
      hasValue ?? (typeof value === "string" ? value.length > 0 : false);

    const cls = clsx(
      fields.fieldInput,
      filled && fields.hasValue,
      short && fields.short,
      error && fields.fieldError,
    );

    const labelCls = clsx(fields.fieldLabel, labelVisuallyHidden && common.visuallyHidden);

    return (
      <div className={fields.fieldWrap}>
        <label className={labelCls} htmlFor={inputId}>
          {label}
          {required && (
            <span className={fields.requiredMark} aria-hidden="true">
              *
            </span>
          )}
        </label>
        <input
          ref={ref}
          id={inputId}
          name={name ?? inputId}
          type={type}
          className={cls}
          autoComplete={autoComplete}
          inputMode={inputMode}
          pattern={pattern}
          maxLength={maxLength}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-label={ariaLabel}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          onBlur={onBlur}
          onFocus={onFocus}
          disabled={disabled}
        />
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
