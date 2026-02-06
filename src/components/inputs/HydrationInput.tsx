const HYDRATION_COLORS = [
  { level: 1, color: "#fcf8e3", label: "1 — well hydrated" },
  { level: 2, color: "#f7f0b0", label: "2 — hydrated" },
  { level: 3, color: "#f0e68c", label: "3 — mildly hydrated" },
  { level: 4, color: "#e6c84c", label: "4 — fair hydration" },
  { level: 5, color: "#d4a017", label: "5 — mildly dehydrated" },
  { level: 6, color: "#c68e17", label: "6 — dehydrated" },
  { level: 7, color: "#b8860b", label: "7 — very dehydrated" },
  { level: 8, color: "#8b6914", label: "8 — severely dehydrated" },
];

interface HydrationInputProps {
  value: number | null;
  onChange: (value: number) => void;
}

export function HydrationInput({ value, onChange }: HydrationInputProps) {
  return (
    <div className="flex gap-1 flex-wrap" role="radiogroup" aria-label="Hydration level">
      {HYDRATION_COLORS.map(({ level, color, label }) => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          className={`flex flex-col items-center p-2 rounded border-2 transition-all min-w-[3rem] ${
            value === level
              ? "border-primary ring-2 ring-primary/30"
              : "border-base-300"
          }`}
          style={{ backgroundColor: color }}
          role="radio"
          aria-checked={value === level}
          aria-label={label}
          title={label}
        >
          <span className="text-sm font-bold text-neutral">{level}</span>
        </button>
      ))}
    </div>
  );
}
