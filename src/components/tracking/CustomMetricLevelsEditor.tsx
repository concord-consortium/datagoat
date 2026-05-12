import { If } from "../common/If";
import type { CustomMetricLevel } from "../../types/customMetrics";
import css from "./CustomMetricLevelsEditor.module.css";

interface Props {
  levels: CustomMetricLevel[];
  onChange: (next: CustomMetricLevel[]) => void;
  // When true, the table renders for display only: inputs are disabled
  // and the Add / Remove row buttons aren't shown. Used by the Y/N
  // top-level kind so the user sees the canonical No/Yes ↔ 0/1 mapping
  // alongside the Categorical view without being able to edit it.
  readOnly?: boolean;
}

export function CustomMetricLevelsEditor({ levels, onChange, readOnly }: Props) {
  function update(idx: number, patch: Partial<CustomMetricLevel>) {
    const next = levels.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    onChange(next);
  }

  function remove(idx: number) {
    onChange(levels.filter((_, i) => i !== idx));
  }

  function add() {
    onChange([...levels, { label: "", value: undefined }]);
  }

  return (
    <div className={css.editor}>
      <table className={css.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Label</th>
            <th>Value</th>
            <th>Color</th>
            <If condition={!readOnly}>
              <th aria-hidden="true"></th>
            </If>
          </tr>
        </thead>
        <tbody>
          {levels.map((level, idx) => (
            <tr key={idx}>
              <td className={css.rowNum}>{idx + 1}</td>
              <td>
                <label className={css.visuallyHidden} htmlFor={`lvl-label-${idx}`}>
                  Label for row {idx + 1}
                </label>
                <input
                  id={`lvl-label-${idx}`}
                  type="text"
                  value={level.label}
                  disabled={readOnly}
                  onChange={(e) => update(idx, { label: e.target.value })}
                />
              </td>
              <td>
                <label className={css.visuallyHidden} htmlFor={`lvl-value-${idx}`}>
                  Value for row {idx + 1}
                </label>
                <input
                  id={`lvl-value-${idx}`}
                  type="number"
                  inputMode="decimal"
                  value={level.value === undefined ? "" : String(level.value)}
                  disabled={readOnly}
                  onChange={(e) => {
                    const v = e.target.value;
                    update(idx, {
                      value: v === "" ? undefined : Number(v),
                    });
                  }}
                />
              </td>
              <td>
                <label className={css.visuallyHidden} htmlFor={`lvl-color-${idx}`}>
                  Color for row {idx + 1}
                </label>
                <input
                  id={`lvl-color-${idx}`}
                  type="color"
                  value={level.color ?? "#000000"}
                  disabled={readOnly}
                  onChange={(e) => update(idx, { color: e.target.value })}
                />
              </td>
              <If condition={!readOnly}>
                <td>
                  <button
                    type="button"
                    className={css.removeBtn}
                    onClick={() => remove(idx)}
                    aria-label={`Remove row ${idx + 1}`}
                  >
                    ×
                  </button>
                </td>
              </If>
            </tr>
          ))}
        </tbody>
      </table>
      <If condition={!readOnly}>
        <button type="button" className={css.addBtn} onClick={add}>
          + Add row
        </button>
      </If>
    </div>
  );
}
