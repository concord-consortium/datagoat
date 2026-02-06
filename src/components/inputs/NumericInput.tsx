import { useState, useEffect } from "react";

interface NumericInputProps {
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit: string;
}

export function NumericInput({
  value,
  onChange,
  min,
  max,
  unit,
}: NumericInputProps) {
  const [inputValue, setInputValue] = useState(value?.toString() ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    setInputValue(value?.toString() ?? "");
  }, [value]);

  function validate(raw: string): number | null {
    if (raw === "") return null;

    const num = Number(raw);
    if (isNaN(num)) {
      setError("Enter a valid number");
      return null;
    }
    if (num < 0) {
      setError("Value cannot be negative");
      return null;
    }
    if (min !== undefined && num < min) {
      setError(`Minimum value is ${min}`);
      return null;
    }
    if (max !== undefined && num > max) {
      setError(`Maximum value is ${max}`);
      return null;
    }
    return num;
  }

  function handleChange(raw: string) {
    setInputValue(raw);
    setError("");
  }

  function handleBlur() {
    const num = validate(inputValue);
    if (num !== null) {
      onChange(num);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      const num = validate(inputValue);
      if (num !== null) {
        onChange(num);
      }
    }
  }

  return (
    <div className="form-control">
      <div className="input-group">
        <input
          type="number"
          className={`input input-bordered w-full ${error ? "input-error" : ""}`}
          value={inputValue}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          min={min ?? 0}
          max={max}
          step="any"
          aria-label={`Value in ${unit}`}
        />
        <span className="bg-base-200 px-3 flex items-center text-base text-base-content/60">
          {unit}
        </span>
      </div>
      {error && <p className="text-error text-sm mt-1">{error}</p>}
    </div>
  );
}
