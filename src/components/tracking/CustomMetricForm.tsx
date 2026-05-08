import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import type {
  CustomMetricInputType,
  CustomMetricType,
} from "../../types/customMetrics";
import css from "./CustomMetricForm.module.css";

const NAME_MAX = 128;
// Demo slice: in-memory state doesn't need a real owner. The next
// plan replaces this with the auth UID when wiring Firestore.
const DEMO_OWNER_ID = "demo-user";

function isValidType(t: string | undefined): t is CustomMetricType {
  return t === "wellness" || t === "performance";
}

interface DraftState {
  name: string;
  inputType: CustomMetricInputType;
  unit: string;
  goalRaw: string;
  yTopRaw: string;
  yBottomRaw: string;
  avgDecimals: string;
}

const EMPTY_DRAFT: DraftState = {
  name: "",
  inputType: "numeric",
  unit: "",
  goalRaw: "0",
  yTopRaw: "10",
  yBottomRaw: "0",
  avgDecimals: "1",
};

export function CustomMetricForm() {
  const { type, metricId } = useParams<{ type: string; metricId?: string }>();
  const navigate = useNavigate();
  const { addMetric, updateMetric, deleteMetric, getMetric } = useCustomMetrics();

  // Hooks must run unconditionally — compute editing in render, but do
  // NOT early-return before useState. React's Rules of Hooks require
  // the same hook calls every render.
  const editing = metricId ? getMetric(metricId) : undefined;

  const [draft, setDraft] = useState<DraftState>(() =>
    editing
      ? {
          name: editing.name,
          inputType: editing.inputType,
          unit: editing.unit,
          goalRaw: String(editing.goalRaw),
          yTopRaw: String(editing.yTopRaw),
          yBottomRaw: String(editing.yBottomRaw),
          avgDecimals: String(editing.avgDecimals),
        }
      : EMPTY_DRAFT,
  );
  const [error, setError] = useState<string | null>(null);

  // Conditional returns are safe AFTER all hooks are declared.
  if (!isValidType(type)) {
    return <Navigate to="/setup/tracking" replace />;
  }
  if (metricId && !editing) {
    return <Navigate to={`/add-metric/${type}`} replace />;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = draft.name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (trimmed.length > NAME_MAX) {
      setError(`Name must be ${NAME_MAX} characters or fewer.`);
      return;
    }
    const goalRaw = Number(draft.goalRaw);
    const yTopRaw = Number(draft.yTopRaw);
    const yBottomRaw = Number(draft.yBottomRaw);
    const avgDecimals = Number(draft.avgDecimals);
    if ([goalRaw, yTopRaw, yBottomRaw, avgDecimals].some((v) => Number.isNaN(v))) {
      setError("Goal, y-axis top/bottom, and decimals must be numbers.");
      return;
    }
    if (yBottomRaw >= yTopRaw) {
      setError("Y-axis top must be greater than y-axis bottom.");
      return;
    }

    if (editing) {
      updateMetric(editing.id, {
        name: trimmed,
        inputType: draft.inputType,
        unit: draft.unit.trim(),
        goalRaw,
        yTopRaw,
        yBottomRaw,
        avgDecimals,
      });
    } else {
      addMetric({
        ownerId: DEMO_OWNER_ID,
        name: trimmed,
        metricType: type,
        inputType: draft.inputType,
        unit: draft.unit.trim(),
        goalRaw,
        yTopRaw,
        yBottomRaw,
        avgDecimals,
      });
    }
    navigate(`/add-metric/${type}`);
  }

  function handleDelete() {
    if (!editing) return;
    if (!window.confirm(`Delete "${editing.name}"? Past entries become invisible.`)) {
      return;
    }
    deleteMetric(editing.id);
    navigate(`/add-metric/${type}`);
  }

  function update<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form className={css.form} onSubmit={handleSubmit} noValidate>
      <div className={css.field}>
        <label className={css.label} htmlFor="cm-name">Name</label>
        <input
          id="cm-name"
          className={css.input}
          type="text"
          value={draft.name}
          maxLength={NAME_MAX}
          onChange={(e) => update("name", e.target.value)}
          autoFocus
        />
      </div>

      <div className={css.field}>
        <label className={css.label} htmlFor="cm-type">Input type</label>
        <select
          id="cm-type"
          className={css.select}
          value={draft.inputType}
          onChange={(e) => update("inputType", e.target.value as CustomMetricInputType)}
        >
          <option value="numeric">Numeric</option>
          <option value="radio">Yes / No</option>
        </select>
      </div>

      <div className={css.field}>
        <label className={css.label} htmlFor="cm-unit">Unit (optional)</label>
        <input
          id="cm-unit"
          className={css.input}
          type="text"
          value={draft.unit}
          onChange={(e) => update("unit", e.target.value)}
        />
      </div>

      <div className={css.field}>
        <label className={css.label} htmlFor="cm-goal">Goal</label>
        <input
          id="cm-goal"
          className={css.input}
          type="number"
          inputMode="decimal"
          value={draft.goalRaw}
          onChange={(e) => update("goalRaw", e.target.value)}
        />
      </div>

      <div className={css.row}>
        <div className={css.field}>
          <label className={css.label} htmlFor="cm-ytop">Y-axis top</label>
          <input
            id="cm-ytop"
            className={css.input}
            type="number"
            inputMode="decimal"
            value={draft.yTopRaw}
            onChange={(e) => update("yTopRaw", e.target.value)}
          />
        </div>
        <div className={css.field}>
          <label className={css.label} htmlFor="cm-ybot">Y-axis bottom</label>
          <input
            id="cm-ybot"
            className={css.input}
            type="number"
            inputMode="decimal"
            value={draft.yBottomRaw}
            onChange={(e) => update("yBottomRaw", e.target.value)}
          />
        </div>
      </div>

      <div className={css.field}>
        <label className={css.label} htmlFor="cm-dec">Decimals</label>
        <input
          id="cm-dec"
          className={css.input}
          type="number"
          inputMode="numeric"
          value={draft.avgDecimals}
          onChange={(e) => update("avgDecimals", e.target.value)}
        />
      </div>

      {error && <p className={css.error}>{error}</p>}

      <div className={css.actions}>
        <button type="button" className={css.secondary} onClick={() => navigate(`/add-metric/${type}`)}>
          Cancel
        </button>
        {editing && (
          <button type="button" className={css.danger} onClick={handleDelete}>
            Delete
          </button>
        )}
        <button type="submit" className={css.primary}>
          Save
        </button>
      </div>
    </form>
  );
}
