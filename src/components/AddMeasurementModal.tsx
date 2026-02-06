import { useState, type FormEvent } from "react";

interface AddMeasurementModalProps {
  onSave: (metric: {
    name: string;
    unit: string;
    inputType: "numeric" | "scale-1-10" | "binary";
    min?: number;
    max?: number;
  }) => void;
  onClose: () => void;
}

export function AddMeasurementModal({
  onSave,
  onClose,
}: AddMeasurementModalProps) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [inputType, setInputType] = useState<"numeric" | "scale-1-10" | "binary">("numeric");
  const [min, setMin] = useState<string>("");
  const [max, setMax] = useState<string>("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSave({
      name,
      unit,
      inputType,
      min: min ? Number(min) : undefined,
      max: max ? Number(max) : undefined,
    });
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg">Add Custom Measurement</h3>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">Name *</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g., Sprint Speed"
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Unit *</span>
            </label>
            <input
              type="text"
              className="input input-bordered w-full"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              required
              placeholder="e.g., mph, lbs, reps"
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Input Type *</span>
            </label>
            <select
              className="select select-bordered w-full"
              value={inputType}
              onChange={(e) =>
                setInputType(
                  e.target.value as "numeric" | "scale-1-10" | "binary",
                )
              }
            >
              <option value="numeric">Numeric</option>
              <option value="scale-1-10">Scale 1-10</option>
              <option value="binary">Yes/No</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">Min (optional)</span>
              </label>
              <input
                type="number"
                className="input input-bordered w-full"
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Max (optional)</span>
              </label>
              <input
                type="number"
                className="input input-bordered w-full"
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add Metric
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
