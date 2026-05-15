import {
  forwardRef,
  useId,
  type ComponentType,
  type Ref,
  type SVGProps,
} from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import ChevronDownIcon from "@/icons/chevron-down.svg?react";
import InfoCircleIcon from "@/icons/info-circle.svg?react";
import { If } from "../common/If";
import fields from "./fields.module.css";
import common from "../common.module.css";
import css from "./SelectField.module.css";

export interface SelectOption {
  value: string;
  label: string;
  // Optional per-option glyph rendered as an inline <svg> inside the
  // <option>. appearance: base-select allows rich option content, and
  // its <selectedcontent> clones the selected option's child elements
  // into the closed-state trigger -- so this one field drives both the
  // open list AND the trigger icon. React still warns that <svg> isn't
  // a valid <option> child (its DOM-nesting validator predates the
  // Customizable Select API); that warning is filtered in the test
  // setup and is harmless at runtime in a non-SSR app.
  Icon?: ComponentType<SVGProps<SVGSVGElement>>;
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
  labelVisuallyHidden?: boolean;
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
      labelVisuallyHidden,
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

    // Glyph for the closed-state trigger. appearance: base-select's
    // default trigger renders only the selected option's text, not its
    // child <svg>, so SelectField paints the icon itself as an overlay
    // (same pattern as the chevron) rather than authoring a
    // <button><selectedcontent> -- which would add button-in-select
    // nesting warnings.
    const selectedValue = value ?? defaultValue;
    const TriggerIcon = options.find(
      (opt) => opt.value === selectedValue,
    )?.Icon;

    const selectCls = clsx(
      fields.fieldSelect,
      filled && fields.hasValue,
      error && fields.fieldError,
      TriggerIcon && css.hasTriggerIcon,
    );

    const labelCls = clsx(fields.fieldLabel, labelVisuallyHidden && common.visuallyHidden);

    return (
      <div className={fields.fieldWrap}>
        <label className={labelCls} htmlFor={selectId}>
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
              <If condition={!filled}>
                <option value="" disabled>
                  {placeholder}
                </option>
              </If>
              {options.map((opt) => {
                const OptionIcon = opt.Icon;
                return (
                  <option key={opt.value} value={opt.value}>
                    {OptionIcon && (
                      <OptionIcon
                        className={css.optionIcon}
                        aria-hidden="true"
                      />
                    )}
                    {opt.label}
                  </option>
                );
              })}
            </select>
            {TriggerIcon && (
              <TriggerIcon className={css.triggerIcon} aria-hidden="true" />
            )}
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
