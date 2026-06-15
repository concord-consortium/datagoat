import { forwardRef, useState, type Ref } from "react";
import clsx from "clsx";
import EyeIcon from "../../icons/eye.svg?react";
import EyeOffIcon from "../../icons/eye-off.svg?react";
import fields from "../form/fields.module.css";
import css from "./PasswordField.module.css";

interface PasswordFieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  autoComplete?: string;
  placeholder?: string;
  forgotLinkTo?: string;
  onForgotClick?: () => void;
  // RHF-compatible props that get forwarded onto the <input>
  name?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  defaultValue?: string;
  disabled?: boolean;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(
    {
      id,
      label,
      required,
      error,
      hint,
      autoComplete = "current-password",
      placeholder,
      forgotLinkTo,
      onForgotClick,
      name,
      onChange,
      onBlur,
      defaultValue,
      disabled,
    }: PasswordFieldProps,
    ref: Ref<HTMLInputElement>,
  ) {
    const [shown, setShown] = useState(false);
    const errorId = error ? `${id}-error` : undefined;
    const hintId = hint ? `${id}-hint` : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

    return (
      <div className={fields.fieldWrap}>
        <div className={fields.labelRow}>
          <label className={fields.fieldLabel} htmlFor={id}>
            {label}
            {required && (
              <span className={fields.requiredMark} aria-hidden="true">
                *
              </span>
            )}
          </label>
          {(forgotLinkTo || onForgotClick) && (
            <a
              className={css.forgotLink}
              href={forgotLinkTo}
              onClick={(e) => {
                if (onForgotClick) {
                  e.preventDefault();
                  onForgotClick();
                }
              }}
            >
              Forgot password?
            </a>
          )}
        </div>
        <div className={css.inputWithEye}>
          <input
            ref={ref}
            id={id}
            name={name ?? id}
            type={shown ? "text" : "password"}
            className={clsx(fields.fieldInput, error && fields.fieldError)}
            autoComplete={autoComplete}
            aria-required={required || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            placeholder={placeholder}
            onChange={onChange}
            onBlur={onBlur}
            defaultValue={defaultValue}
            disabled={disabled}
          />
          <button
            type="button"
            className={css.eyeBtn}
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            onClick={() => setShown((s) => !s)}
          >
            {shown ? <EyeOffIcon /> : <EyeIcon />}
          </button>
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
