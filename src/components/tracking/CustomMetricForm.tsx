import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import { useData } from "../../contexts/DataContext";
import { useUser } from "../../contexts/UserContext";
import { hasEntriesForMetric } from "../../utils/customMetricEntries";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { COMPETITION_METRICS } from "../../metrics/competitionMetrics";
import { TextField } from "../form/TextField";
import { CustomMetricLevelsEditor } from "./CustomMetricLevelsEditor";
import type {
  CustomMetricDef,
  CustomMetricInputType,
  CustomMetricLevel,
  CustomMetricType,
} from "../../types/customMetrics";
import css from "./CustomMetricForm.module.css";

const NAME_MAX = 128;

type TopLevelKind = "numeric" | "categorical" | "yn";

const YN_LEVELS: CustomMetricLevel[] = [
  { label: "No", value: 0 },
  { label: "Yes", value: 1 },
];

function inferTopLevel(def: CustomMetricDef): TopLevelKind {
  if (def.primitive === "numeric") return "numeric";
  const lvls = def.levels;
  if (
    lvls &&
    lvls.length === 2 &&
    lvls[0].label === "No" &&
    lvls[0].value === 0 &&
    lvls[1].label === "Yes" &&
    lvls[1].value === 1
  ) {
    return "yn";
  }
  return "categorical";
}

function isValidType(t: string | undefined): t is CustomMetricType {
  return t === "health" || t === "competition";
}

interface DraftState {
  topLevel: TopLevelKind;
  name: string;
  inputType: CustomMetricInputType;
  unit: string;
  goalRaw: string;
  yTopRaw: string;
  yBottomRaw: string;
  avgDecimals: string;
  referenceUrl: string;
  levels: CustomMetricLevel[];
}

const EMPTY_DRAFT: DraftState = {
  topLevel: "numeric",
  name: "",
  inputType: "numeric",
  unit: "",
  goalRaw: "0",
  yTopRaw: "10",
  yBottomRaw: "0",
  avgDecimals: "1",
  referenceUrl: "",
  levels: [],
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
  const { health, competition } = useData();

  if (!isValidType(type)) {
    return <Navigate to="/setup/tracking" replace />;
  }

  if (metricId) {
    if (loading) {
      return <p className={css.loading}>Loading…</p>;
    }
    const editing = getMetric(metricId);
    if (!editing) {
      return <Navigate to="/setup/tracking" replace />;
    }
    // Redirect to the canonical type-matched route if the URL :type
    // disagrees with the metric's actual metricType. Without this,
    // Cancel/Save/Delete navigation in the body would go back to the
    // wrong type's list page.
    if (editing.metricType !== type) {
      return (
        <Navigate
          to={`/add-metric/${editing.metricType}/${editing.id}`}
          replace
        />
      );
    }
    // The body's edit-confirmation guard reads health/competition
    // entries to decide whether changing input type or unit needs user
    // confirmation. While those logs are still loading, the body would
    // fall back to empty arrays and silently skip the prompt — wait for
    // both to land so the prompt fires reliably.
    if (health.status !== "loaded" || competition.status !== "loaded") {
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
  const { health, competition } = useData();
  const { loadState, updateProfile, setTrackedMetrics } = useUser();
  const healthEntries =
    health.status === "loaded" ? health.entries : [];
  const competitionEntries =
    competition.status === "loaded" ? competition.entries : [];

  const [draft, setDraft] = useState<DraftState>(() => {
    if (!editing) return EMPTY_DRAFT;
    const topLevel = inferTopLevel(editing);
    return {
      topLevel,
      name: editing.name,
      inputType: editing.inputType,
      unit: editing.unit ?? "",
      goalRaw: String(editing.goalRaw ?? 0),
      yTopRaw: String(editing.yTopRaw ?? 0),
      yBottomRaw: String(editing.yBottomRaw ?? 0),
      avgDecimals: String(editing.avgDecimals ?? 1),
      // ?? "" so docs written before referenceUrl was added (or by an
      // external tool that omitted the field) don't crash the controlled
      // input on undefined.
      referenceUrl: editing.referenceUrl ?? "",
      levels: editing.levels ?? [],
    };
  });
  const [error, setError] = useState<string | null>(null);

  function switchTopLevel(next: TopLevelKind) {
    setDraft((prev) => {
      if (next === "numeric") {
        return { ...prev, topLevel: next, inputType: "numeric", levels: [] };
      }
      if (next === "yn") {
        return { ...prev, topLevel: next, inputType: "radio", levels: YN_LEVELS };
      }
      return { ...prev, topLevel: next, inputType: "radio", levels: prev.levels };
    });
  }

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
    // !Number.isFinite rejects NaN, +Infinity, and -Infinity. Plain
    // Number.isNaN would accept Infinity (e.g. typing 1e500 into the
    // numeric input parses to Infinity), which would corrupt chart
    // scaling once persisted.
    if ([goalRaw, yTopRaw, yBottomRaw, avgDecimals].some((v) => !Number.isFinite(v))) {
      setError("Goal, y-axis top/bottom, and decimals must be finite numbers.");
      return;
    }
    if (
      !Number.isInteger(avgDecimals) ||
      avgDecimals < 0 ||
      avgDecimals > 100
    ) {
      // 100 is the upper bound `Number.prototype.toFixed` accepts —
      // beyond that it throws RangeError, which would crash chart
      // formatting for the metric.
      setError("Decimals must be an integer between 0 and 100.");
      return;
    }
    if (yBottomRaw >= yTopRaw) {
      setError("Y-axis top must be greater than y-axis bottom.");
      return;
    }
    const referenceUrl = draft.referenceUrl.trim();
    if (referenceUrl) {
      // Two-step validation:
      //   1. WHATWG URL parse — the browser's native input-type=url
      //      feedback is permissive, and jsdom is more so. The parse
      //      catches truly malformed strings.
      //   2. Protocol check — `new URL()` accepts `javascript:`,
      //      `data:`, `file:`, etc. The value is rendered into an
      //      `<a href>` on MetricDetail, so a `javascript:` URL would
      //      execute arbitrary code on click. Restrict to http/https.
      let parsed: URL;
      try {
        parsed = new URL(referenceUrl);
      } catch {
        setError(
          "Reference URL must be a valid http:// or https:// URL.",
        );
        return;
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setError(
          "Reference URL must use http:// or https://.",
        );
        return;
      }
    }

    try {
      if (editing) {
        const inputTypeChanged = draft.inputType !== editing.inputType;
        const unitChanged = draft.unit.trim() !== editing.unit;
        const dataShapingChanged = inputTypeChanged || unitChanged;
        if (
          dataShapingChanged &&
          hasEntriesForMetric(editing.id, healthEntries, competitionEntries)
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
          referenceUrl,
        });
      } else {
        // TODO (Task 5): pass primitive + levels; derive y-range for
        // ordinals. For now forward "numeric" as primitive so existing
        // tests that exercise the numeric path continue to pass.
        const def = await addMetric({
          name: trimmed,
          metricType: type,
          primitive: "numeric",
          inputType: draft.inputType,
          unit: draft.unit.trim() || undefined,
          goalRaw,
          yTopRaw,
          yBottomRaw,
          avgDecimals,
          referenceUrl,
        });
        // Auto-track the newly created metric. Appending to the existing
        // tracked-ids list places it right after the user's last
        // currently-tracked item — Tracked Data Setup renders trackedIds
        // first in their stored order, so the new metric appears at the
        // end of the checked group rather than below all the unchecked
        // built-ins. Fire-and-forget: the metric write already succeeded,
        // a transient tracked-list update failure shouldn't block the
        // navigate that follows.
        const profile =
          loadState.status === "loaded" ? loadState.profile : null;
        const builtIns =
          type === "health" ? HEALTH_METRICS : COMPETITION_METRICS;
        const currentIds =
          (type === "health"
            ? profile?.trackedHealthMetrics
            : profile?.trackedCompetitionMetrics) ??
          builtIns.map((m) => m.id);
        const next = [...currentIds, def.id];
        if (!profile) {
          void updateProfile({
            [type === "health"
              ? "trackedHealthMetrics"
              : "trackedCompetitionMetrics"]: next,
          });
        } else {
          void setTrackedMetrics(type, next);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to save custom metric", err);
      setError("Couldn't save your metric. Please try again.");
      return;
    }
    navigate("/setup/tracking");
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
    navigate("/setup/tracking");
  }

  function update<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  const unitDisabled = draft.topLevel !== "numeric";
  const goalDisabled = draft.topLevel === "yn";
  const yAxisDisabled = draft.topLevel !== "numeric";

  return (
    <form className={css.form} onSubmit={handleSubmit} noValidate>
      <fieldset className={css.typeChooser}>
        <legend className={css.typeChooserLegend}>Type</legend>
        <label className={css.typeOption}>
          <input
            type="radio"
            name="cm-toplevel"
            value="numeric"
            checked={draft.topLevel === "numeric"}
            onChange={() => switchTopLevel("numeric")}
          />
          Numeric
        </label>
        <label className={css.typeOption}>
          <input
            type="radio"
            name="cm-toplevel"
            value="categorical"
            checked={draft.topLevel === "categorical"}
            onChange={() => switchTopLevel("categorical")}
          />
          Categorical
        </label>
        <label className={css.typeOption}>
          <input
            type="radio"
            name="cm-toplevel"
            value="yn"
            checked={draft.topLevel === "yn"}
            onChange={() => switchTopLevel("yn")}
          />
          Y/N
        </label>
      </fieldset>

      <TextField
        id="cm-name"
        label="Name"
        value={draft.name}
        maxLength={NAME_MAX}
        onChange={(e) => update("name", e.target.value)}
      />

      {draft.topLevel === "categorical" && (
        <div className={css.levelsBlock}>
          <label className={css.fieldLabel}>Levels</label>
          <CustomMetricLevelsEditor
            levels={draft.levels}
            onChange={(next) => update("levels", next)}
          />
        </div>
      )}

      <TextField
        id="cm-unit"
        label="Unit (optional)"
        value={draft.unit}
        disabled={unitDisabled}
        onChange={(e) => update("unit", e.target.value)}
      />

      <TextField
        id="cm-goal"
        label="Goal"
        type="number"
        inputMode="decimal"
        value={draft.goalRaw}
        disabled={goalDisabled}
        onChange={(e) => update("goalRaw", e.target.value)}
      />

      <div className={css.row}>
        <TextField
          id="cm-ytop"
          label="Y-axis top"
          type="number"
          inputMode="decimal"
          value={draft.yTopRaw}
          disabled={yAxisDisabled}
          onChange={(e) => update("yTopRaw", e.target.value)}
        />
        <TextField
          id="cm-ybot"
          label="Y-axis bottom"
          type="number"
          inputMode="decimal"
          value={draft.yBottomRaw}
          disabled={yAxisDisabled}
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

      <TextField
        id="cm-ref"
        label="Reference URL (optional)"
        type="url"
        inputMode="url"
        value={draft.referenceUrl}
        onChange={(e) => update("referenceUrl", e.target.value)}
      />

      {error && <p className={css.error}>{error}</p>}

      <div className={css.actions}>
        <button type="button" className={css.secondary} onClick={() => navigate("/setup/tracking")}>
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
