import { useState } from "react";
import type { MetricDefinition } from "../types/metrics";
import { HydrationInput } from "./inputs/HydrationInput";
import { ScaleInput } from "./inputs/ScaleInput";
import { NumericInput } from "./inputs/NumericInput";
import { BinaryInput } from "./inputs/BinaryInput";

interface QuickEntryModalProps {
  metric: MetricDefinition;
  onSave: (value: number) => void;
  onClose: () => void;
}

export function QuickEntryModal({
  metric,
  onSave,
  onClose,
}: QuickEntryModalProps) {
  const [value, setValue] = useState<number | null>(null);

  function handleSave() {
    if (value !== null) {
      onSave(value);
    }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg">Enter {metric.name}</h3>
        <p className="text-sm text-base-content/60 mb-4">
          {metric.description}
        </p>

        <div className="py-4">
          {metric.inputType === "color-scale" && (
            <HydrationInput value={value} onChange={setValue} />
          )}
          {metric.inputType === "scale-1-5" && (
            <ScaleInput
              value={value}
              onChange={setValue}
              metricId={metric.id}
            />
          )}
          {(metric.inputType === "numeric" ||
            metric.inputType === "scale-1-10") && (
            <NumericInput
              value={value}
              onChange={setValue}
              min={metric.min}
              max={metric.max}
              unit={metric.unit}
            />
          )}
          {metric.inputType === "binary" && (
            <BinaryInput value={value} onChange={setValue} />
          )}
        </div>

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={value === null}
          >
            Save
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
