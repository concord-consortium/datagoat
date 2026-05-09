import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import { useData } from "../../contexts/DataContext";
import { hasEntriesForMetric } from "../../utils/customMetricEntries";
import { TextField } from "../form/TextField";
import { SelectField } from "../form/SelectField";
import type {
  CustomMetricDef,
  CustomMetricInputType,
  CustomMetricType,
} from "../../types/customMetrics";
import css from "./CustomMetricForm.module.css";

const NAME_MAX = 128;

// `radio` (Yes/No) input is reserved in the type system but not yet
// wired through the wellness/performance log render + storage paths.
// Surfacing it in the form would let users create metrics that can't
// actually be logged, so the option is hidden until the end-to-end
// path lands. Re-add `{ value: "radio", label: "Yes / No" }` then.
const INPUT_TYPE_OPTIONS = [
  { value: "numeric", label: "Numeric" },
];

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

// Outer gate. Resolves the route's :type and :metricId, waits for the
// first Firestore snapshot before deciding whether an edit URL points
// at a real metric, and only then mounts the inner body. The split
// matters because the body's useState(initialDraft) only fires once
// per mount — without the gate, deep-link/refresh on
// /add-metric/:type/:metricId would either Navigate away before
// metrics load (false negative) or initialize the form with an empty
// draft that never re-syncs when the metric arrives.
export function CustomMetricForm() {
  const { type, metricId } = useParams<{ type: string; metricId?: string }>();
  const { getMetric, loading } = useCustomMetrics();
  const { wellness, performance } = useData();

  if (!isValidType(type)) {
    return <Navigate to="/setup/tracking" replace />;
  }

  if (metricId) {
    if (loading) {
      return <p className={css.loading}>Loading…</p>;
    }
    const editing = getMetric(metricId);
    if (!editing) {
      return <Navigate to={`/add-metric/${type}`} replace />;
    }
    // The body's edit-confirmation guard reads wellness/performance
    // entries to decide whether changing input type or unit needs user
    // confirmation. While those logs are still loading, the body would
    // fall back to empty arrays and silently skip the prompt — wait for
    // both to land so the prompt fires reliably.
    if (wellness.status !== "loaded" || performance.status !== "loaded") {
      return <p className={css.loading}>Loading…</p>;
    }
    return <CustomMetricFormBody type={type} editing={editing} />;
  }

  return <CustomMetricFormBody type={type} editing={undefined} />;
}

interface BodyProps {
  type: CustomMetricType;
  editing: CustomMetricDef | undefined;
}

function CustomMetricFormBody({ type, editing }: BodyProps) {
  const navigate = useNavigate();
  const { addMetric, updateMetric, deleteMetric } = useCustomMetrics();
  const { wellness, performance } = useData();
  const wellnessEntries =
    wellness.status === "loaded" ? wellness.entries : [];
  const performanceEntries =
    performance.status === "loaded" ? performance.entries : [];

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

  async function handleSubmit(e: FormEvent) {
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

    try {
      if (editing) {
        const inputTypeChanged = draft.inputType !== editing.inputType;
        const unitChanged = draft.unit.trim() !== editing.unit;
        const dataShapingChanged = inputTypeChanged || unitChanged;
        if (
          dataShapingChanged &&
          hasEntriesForMetric(editing.id, wellnessEntries, performanceEntries)
        ) {
          const fields = [
            inputTypeChanged ? "input type" : null,
            unitChanged ? "unit" : null,
          ]
            .filter(Boolean)
            .join(" and ");
          if (
            !window.confirm(
              `Changing the ${fields} will affect entries you have already logged. Continue?`,
            )
          ) {
            return;
          }
        }
        await updateMetric(editing.id, {
          name: trimmed,
          inputType: draft.inputType,
          unit: draft.unit.trim(),
          goalRaw,
          yTopRaw,
          yBottomRaw,
          avgDecimals,
        });
      } else {
        await addMetric({
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
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to save custom metric", err);
      setError("Couldn't save your metric. Please try again.");
      return;
    }
    navigate(`/add-metric/${type}`);
  }

  async function handleDelete() {
    if (!editing) return;
    if (!window.confirm(`Delete "${editing.name}"? Past entries become invisible.`)) {
      return;
    }
    try {
      await deleteMetric(editing.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to delete custom metric", err);
      setError("Couldn't delete your metric. Please try again.");
      return;
    }
    navigate(`/add-metric/${type}`);
  }

  function update<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form className={css.form} onSubmit={handleSubmit} noValidate>
      <TextField
        id="cm-name"
        label="Name"
        value={draft.name}
        maxLength={NAME_MAX}
        onChange={(e) => update("name", e.target.value)}
      />

      <SelectField
        id="cm-type"
        label="Input type"
        value={draft.inputType}
        options={INPUT_TYPE_OPTIONS}
        onChange={(e) => update("inputType", e.target.value as CustomMetricInputType)}
      />

      <TextField
        id="cm-unit"
        label="Unit (optional)"
        value={draft.unit}
        onChange={(e) => update("unit", e.target.value)}
      />

      <TextField
        id="cm-goal"
        label="Goal"
        type="number"
        inputMode="decimal"
        value={draft.goalRaw}
        onChange={(e) => update("goalRaw", e.target.value)}
      />

      <div className={css.row}>
        <TextField
          id="cm-ytop"
          label="Y-axis top"
          type="number"
          inputMode="decimal"
          value={draft.yTopRaw}
          onChange={(e) => update("yTopRaw", e.target.value)}
        />
        <TextField
          id="cm-ybot"
          label="Y-axis bottom"
          type="number"
          inputMode="decimal"
          value={draft.yBottomRaw}
          onChange={(e) => update("yBottomRaw", e.target.value)}
        />
      </div>

      <TextField
        id="cm-dec"
        label="Decimals"
        type="number"
        inputMode="numeric"
        value={draft.avgDecimals}
        onChange={(e) => update("avgDecimals", e.target.value)}
      />

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
