interface BinaryInputProps {
  value: number | null;
  onChange: (value: number) => void;
}

export function BinaryInput({ value, onChange }: BinaryInputProps) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        type="checkbox"
        className="checkbox checkbox-primary"
        checked={value === 1}
        onChange={(e) => onChange(e.target.checked ? 1 : 0)}
        aria-label="Available for play/practice"
      />
      <span className="label-text">
        {value === 1 ? "Yes — Available" : "Not available"}
      </span>
    </label>
  );
}
