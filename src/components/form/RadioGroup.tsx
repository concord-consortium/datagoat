import { useId, type ChangeEventHandler, type ReactNode } from "react";
import css from "./RadioGroup.module.css";

export interface RadioOption {
  value: string;
  label: ReactNode;
}

export interface RadioGroupProps {
  name: string;
  legend: ReactNode;
  options: RadioOption[];
  value: string | null;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  hint?: string;
  // Visually hide the legend (still exposed to assistive tech).
  legendVisuallyHidden?: boolean;
  className?: string;
  // Compact horizontal variant (used by the availability tree's Y/N rows).
  inline?: boolean;
  disabled?: boolean;
}

// Wraps a <fieldset> + <legend> + .avail-radio inputs. aria-describedby is
// wired on the fieldset rather than per-radio.
export function RadioGroup({
  name,
  legend,
  options,
  value,
  onChange,
  required,
  error,
  hint,
  legendVisuallyHidden,
  className,
  inline,
  disabled,
}: RadioGroupProps) {
  const reactId = useId();
  const errorId = error ? `${reactId}-error` : undefined;
  const hintId = hint ? `${reactId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  const handleChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    onChange(e.target.value);
  };

  const cls = [
    css.group,
    inline ? css.inline : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <fieldset
      className={cls}
      aria-describedby={describedBy}
      aria-required={required || undefined}
      aria-invalid={error ? true : undefined}
      disabled={disabled}
    >
      <legend className={legendVisuallyHidden ? css.legendHidden : css.legend}>
        {legend}
      </legend>
      {options.map((opt) => {
        const optionId = `${reactId}-${opt.value}`;
        return (
          <label key={opt.value} htmlFor={optionId} className={css.option}>
            <input
              id={optionId}
              type="radio"
              className={css.radio}
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={handleChange}
            />
            <span className={css.optionLabel}>{opt.label}</span>
          </label>
        );
      })}
      {error && (
        <p id={errorId} className={css.errorMsg} role="alert">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className={css.hint}>
          {hint}
        </p>
      )}
    </fieldset>
  );
}
