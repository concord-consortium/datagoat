const MOOD_LABELS = ["1 — very poor", "2 — poor", "3 — fair", "4 — good", "5 — excellent"];
const FATIGUE_LABELS = ["1 — fully rested", "2 — rested", "3 — moderate", "4 — tired", "5 — exhausted"];

interface ScaleInputProps {
  value: number | null;
  onChange: (value: number) => void;
  metricId: string;
}

export function ScaleInput({ value, onChange, metricId }: ScaleInputProps) {
  const labels = metricId === "fatigue" ? FATIGUE_LABELS : MOOD_LABELS;
  const groupLabel = metricId === "fatigue" ? "Fatigue level" : "Mood level";

  return (
    <div className="flex gap-2" role="radiogroup" aria-label={groupLabel}>
      {[1, 2, 3, 4, 5].map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          className={`btn btn-md flex-1 ${
            value === level ? "btn-primary" : "btn-outline"
          }`}
          role="radio"
          aria-checked={value === level}
          aria-label={labels[level - 1]}
          title={labels[level - 1]}
        >
          {level}
        </button>
      ))}
    </div>
  );
}
