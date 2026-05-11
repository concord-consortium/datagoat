import {
  useEffect,
  useState,
  type ChangeEventHandler,
  type CompositionEventHandler,
} from "react";

// Local string state for a numeric text input whose parent stores the
// value as a number (and re-renders with String(numeric)). Holds the
// user's exact keystrokes so in-progress strings like "1.", "07", and
// bare "0" survive the parent's Number() round-trip. Reconciles with
// the parent prop only when it changes to a value that doesn't round-
// trip to the local string (e.g. cross-tab edit, form reset). Rejects
// non-numeric keystrokes without firing onChange, leaving the prior
// local string in place.
//
// `allowNegative` opens the regex up to an optional leading `-` so
// custom metrics whose y-axis range goes below 0 can be entered.
// Built-in metrics (always non-negative scales) leave it false.
export function useNumericLocalString(
  value: string,
  onChange: (raw: string) => void,
  allowNegative: boolean = false,
): {
  local: string;
  handleChange: ChangeEventHandler<HTMLInputElement>;
  handleCompositionEnd: CompositionEventHandler<HTMLInputElement>;
} {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    const localNumeric = local === "" ? 0 : Number(local);
    const parentNumeric = value === "" ? 0 : Number(value);
    if (!Number.isFinite(localNumeric) || localNumeric !== parentNumeric) {
      setLocal(value);
    }
    // Intentionally only depend on `value` - we don't want to refresh
    // local state every time the user types (which would trigger this
    // effect via the parent's controlled re-render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const filter = allowNegative
    ? /^-?[0-9]*\.?[0-9]*$/
    : /^[0-9]*\.?[0-9]*$/;
  const handleChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const raw = e.target.value;
    // Let in-flight IME composition through unfiltered; reconciling the
    // controlled value mid-composition stalls Android/AT keyboards.
    // handleCompositionEnd validates the committed string.
    if ((e.nativeEvent as InputEvent).isComposing) {
      setLocal(raw);
      return;
    }
    if (!filter.test(raw)) return;
    setLocal(raw);
    onChange(raw);
  };
  const handleCompositionEnd: CompositionEventHandler<HTMLInputElement> = (e) => {
    const raw = e.currentTarget.value;
    if (filter.test(raw)) {
      setLocal(raw);
      onChange(raw);
    } else {
      setLocal(value);
    }
  };
  return { local, handleChange, handleCompositionEnd };
}
