import { useMemo, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import { useData } from "../../contexts/DataContext";
import { useUser } from "../../contexts/UserContext";
import { hasEntriesForMetric } from "../../utils/customMetricEntries";
import {
  normalizeMetricName,
  suggestUniqueName,
} from "../../utils/metricNameValidation";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { COMPETITION_METRICS } from "../../metrics/competitionMetrics";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import {
  ADDABLE_COMPETITION,
  ADDABLE_HEALTH,
  ADDABLE_PERFORMANCE,
} from "../../metrics/addableMetrics";
import { useMetricOverrides } from "../../contexts/MetricOverridesContext";
import { MetricOverrideForm } from "./MetricOverrideForm";
import { TextField } from "../form/TextField";
import radioCss from "../form/RadioGroup.module.css";
import { CustomMetricLevelsEditor } from "./CustomMetricLevelsEditor";
import { If } from "../common/If";
import type {
  CustomMetricDef,
  CustomMetricInputType,
  CustomMetricLevel,
} from "../../types/customMetrics";
import css from "./CustomMetricForm.module.css";

const NAME_MAX = 128;

type AuthorableCustomMetricType = "health" | "performance" | "competition";

type TopLevelKind = "numeric" | "categorical" | "yn";

const YN_LEVELS: CustomMetricLevel[] = [
  { label: "No", value: 0 },
  { label: "Yes", value: 1 },
];

function deriveLevelRangeDisplay(
  levels: CustomMetricLevel[],
): { top: string; bottom: string } {
  const values = levels
    .map((l) => l.value)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (values.length === 0) {
    return { top: "", bottom: "" };
  }
  return {
    top: String(Math.max(...values)),
    bottom: String(Math.min(...values)),
  };
}

function sameLevelValues(
  a: CustomMetricLevel[] | undefined,
  b: CustomMetricLevel[] | undefined,
): boolean {
  const sortedFiniteValues = (lvls: CustomMetricLevel[] | undefined): number[] =>
    (lvls ?? [])
      .map((l) => l.value)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      .sort((x, y) => x - y);
  const ax = sortedFiniteValues(a);
  const bx = sortedFiniteValues(b);
  if (ax.length !== bx.length) return false;
  return ax.every((v, i) => v === bx[i]);
}

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

function buildPayload(
  draft: DraftState,
  trimmedName: string,
  trimmedRef: string,
  type: AuthorableCustomMetricType,
): Omit<CustomMetricDef, "id" | "ownerId" | "createdAt" | "updatedAt"> {
  const avgDecimals = Number(draft.avgDecimals);
  if (
    !Number.isInteger(avgDecimals) ||
    avgDecimals < 0 ||
    avgDecimals > 100
  ) {
    throw new Error("Decimals must be an integer between 0 and 100.");
  }

  if (draft.topLevel === "numeric") {
    const goalRaw = Number(draft.goalRaw);
    const yTopRaw = Number(draft.yTopRaw);
    const yBottomRaw = Number(draft.yBottomRaw);
    if ([goalRaw, yTopRaw, yBottomRaw].some((v) => !Number.isFinite(v))) {
      throw new Error("Goal, y-axis top, and y-axis bottom must be finite.");
    }
    if (yBottomRaw >= yTopRaw) {
      throw new Error("Y-axis top must be greater than y-axis bottom.");
    }
    return {
      name: trimmedName,
      metricType: type,
      primitive: "numeric",
      inputType: "numeric",
      unit: draft.unit.trim(),
      goalRaw,
      yTopRaw,
      yBottomRaw,
      avgDecimals,
      referenceUrl: trimmedRef,
    };
  }

  // Categorical / Y/N share an ordinal shape.
  const levels = draft.topLevel === "yn" ? YN_LEVELS : draft.levels;
  if (levels.some((l) => !l.label.trim())) {
    throw new Error("Each level needs a label.");
  }
  if (levels.some((l) => l.value === undefined || !Number.isFinite(l.value))) {
    throw new Error("Each level needs a numeric value.");
  }
  if (levels.length < 2) {
    throw new Error("Categorical metrics need at least two levels.");
  }
  const values = levels.map((l) => l.value as number);
  if (new Set(values).size !== values.length) {
    throw new Error("Level values must be unique.");
  }
  const yTopRaw = Math.max(...values);
  const yBottomRaw = Math.min(...values);

  return {
    name: trimmedName,
    metricType: type,
    primitive: "ordinal",
    inputType: "radio",
    levels: levels.map((l) => {
      const out: CustomMetricLevel = { label: l.label.trim(), value: l.value };
      if (l.color) out.color = l.color;
      return out;
    }),
    avgDecimals,
    // For Y/N: goal is greyed and omitted. For Categorical: goal is editable
    // and meaningful. Empty string defaults to 0; anything that parses to
    // a non-finite number (NaN, Infinity from `1e500`) is rejected
    // explicitly so it can't leak through `|| 0` short-circuit logic and
    // corrupt chart scaling/formatting downstream.
    ...(draft.topLevel === "yn" ? {} : { goalRaw: parseCategoricalGoal(draft.goalRaw) }),
    yTopRaw,
    yBottomRaw,
    referenceUrl: trimmedRef,
  };
}

function parseCategoricalGoal(raw: string): number {
  if (raw.trim() === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error("Goal must be a finite number.");
  }
  return n;
}

function isAuthorableType(t: string | undefined): t is AuthorableCustomMetricType {
  return t === "health" || t === "performance" || t === "competition";
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
  const { loading: overridesLoading } = useMetricOverrides();
  const { health, performance, competition } = useData();

  if (!isAuthorableType(type)) {
    return <Navigate to="/setup/tracking" replace />;
  }

  if (metricId) {
    // Built-in metric id? Route to the goal/axis override form. The
    // built-in registries resolve synchronously, so this is decided
    // before the custom-metric snapshot is consulted below. Built-in
    // ids (e.g. "leanMass") never collide with custom-metric ids.
    const builtIns =
      type === "health"
        ? [...HEALTH_METRICS, ...ADDABLE_HEALTH]
        : type === "performance"
          ? [...PERFORMANCE_METRICS, ...ADDABLE_PERFORMANCE]
          : [...COMPETITION_METRICS, ...ADDABLE_COMPETITION];
    const builtIn = builtIns.find((m) => m.id === metricId);
    if (builtIn) {
      // Wait for the override snapshot before mounting the form. The
      // form's useState seeds its goal/axis fields from getOverride()
      // and lookupGoalLine() exactly once at mount; rendering it
      // before the snapshot lands would seed with defaults and could
      // overwrite an existing override on save.
      if (overridesLoading) {
        return <p className={css.loading}>Loading…</p>;
      }
      return <MetricOverrideForm metric={builtIn} />;
    }

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
    // The body's edit-confirmation guard reads health/performance/
    // competition entries to decide whether changing input type or unit
    // needs user confirmation. While those logs are still loading, the
    // body would fall back to empty arrays and silently skip the prompt
    // — wait for all three to land so the prompt fires reliably.
    if (
      health.status !== "loaded" ||
      performance.status !== "loaded" ||
      competition.status !== "loaded"
    ) {
      return <p className={css.loading}>Loading…</p>;
    }
    return <CustomMetricFormBody type={type} editing={editing} />;
  }

  return <CustomMetricFormBody type={type} editing={undefined} />;
}

interface BodyProps {
  type: AuthorableCustomMetricType;
  editing: CustomMetricDef | undefined;
}

function CustomMetricFormBody({ type, editing }: BodyProps) {
  const navigate = useNavigate();
  const { metrics, addMetric, updateMetric, deleteMetric } = useCustomMetrics();
  const { health, performance, competition } = useData();
  const { loadState, updateProfile, setTrackedMetrics } = useUser();
  const healthEntries =
    health.status === "loaded" ? health.entries : [];
  const performanceEntries =
    performance.status === "loaded" ? performance.entries : [];
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
      // Y/N opens with an empty draft.levels: the editor + buildPayload
      // both substitute YN_LEVELS for that case, so storing the canonical
      // pair in draft.levels would just be dead state — and would muddy a
      // future Categorical detour by carrying the Y/N rows into the
      // editable table.
      levels: topLevel === "yn" ? [] : (editing.levels ?? []),
    };
  });
  const [error, setError] = useState<string | null>(null);

  // The set of names a new/edited metric must not collide with: every
  // built-in default (on + addable, all three types) plus the user's own
  // custom metrics, normalized for case-insensitive comparison. The
  // metric being edited is excluded so re-saving it without a rename
  // doesn't flag its own name as a duplicate.
  const existingNames = useMemo(() => {
    const set = new Set<string>();
    const addAll = (defs: readonly { name: string }[]) => {
      for (const d of defs) set.add(normalizeMetricName(d.name));
    };
    addAll(HEALTH_METRICS);
    addAll(PERFORMANCE_METRICS);
    addAll(COMPETITION_METRICS);
    addAll(ADDABLE_HEALTH);
    addAll(ADDABLE_PERFORMANCE);
    addAll(ADDABLE_COMPETITION);
    for (const m of metrics) {
      if (m.id === editing?.id) continue;
      set.add(normalizeMetricName(m.name));
    }
    return set;
  }, [metrics, editing]);

  const trimmedName = draft.name.trim();
  const isDuplicateName =
    trimmedName !== "" && existingNames.has(normalizeMetricName(trimmedName));
  const suggestedName = isDuplicateName
    ? suggestUniqueName(trimmedName, existingNames)
    : null;

  function switchTopLevel(next: TopLevelKind) {
    setDraft((prev) => {
      if (next === "numeric") {
        return { ...prev, topLevel: next, inputType: "numeric", levels: [] };
      }
      if (next === "yn") {
        // Y/N is a constant preset, not a user-edited state. Leave
        // prev.levels alone so a user who was mid-edit on Categorical
        // can tab back without their rows being overwritten. The
        // levels editor render and buildPayload both substitute
        // YN_LEVELS for Y/N regardless of what's in draft.levels.
        //
        // Reset avgDecimals to the canonical default so a value the
        // user set in Numeric mode doesn't silently persist into a
        // Y/N save (the decimals field is greyed in Y/N, so any
        // residual value would feel like a hidden-state bug).
        return { ...prev, topLevel: next, inputType: "radio", avgDecimals: "1" };
      }
      // Categorical: preserve existing rows when the user is toggling
      // back from Y/N or returning to a partially-edited table. Seed two
      // empty rows on first entry so the table isn't a bare header — the
      // minimum the form accepts on submit is two levels.
      const levels =
        prev.levels.length > 0
          ? prev.levels
          : [
              { label: "", value: undefined },
              { label: "", value: undefined },
            ];
      return { ...prev, topLevel: next, inputType: "radio", levels };
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
    // Save is disabled while a collision warning is showing; this guards
    // the Enter-key / stale-state path so a duplicate name can never be
    // persisted without the user resolving it.
    if (isDuplicateName) {
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

    let payload: Omit<CustomMetricDef, "id" | "ownerId" | "createdAt" | "updatedAt">;
    try {
      payload = buildPayload(draft, trimmed, referenceUrl, type);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid form.");
      return;
    }

    try {
      if (editing) {
        const inputTypeChanged = payload.inputType !== editing.inputType;
        const unitChanged = (payload.unit ?? "") !== (editing.unit ?? "");
        // Compare ordinal level values by their multiset (sorted), so a
        // pure row-reorder that keeps the same numeric values doesn't
        // trip the prompt (entries stored as the numeric corollary keep
        // their meaning) but a remap or length change does. Labels and
        // colors are display-only and don't reinterpret stored entries,
        // so they aren't part of the diff.
        const levelsChanged = !sameLevelValues(payload.levels, editing.levels);
        const dataShapingChanged =
          inputTypeChanged || unitChanged || levelsChanged;
        if (
          dataShapingChanged &&
          hasEntriesForMetric(
            editing.id,
            healthEntries,
            performanceEntries,
            competitionEntries,
          )
        ) {
          const fields = [
            inputTypeChanged ? "input type" : null,
            unitChanged ? "unit" : null,
            levelsChanged ? "level values" : null,
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
        await updateMetric(editing.id, { ...payload });
      } else {
        const def = await addMetric(payload);
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
          type === "health"
            ? HEALTH_METRICS
            : type === "performance"
              ? PERFORMANCE_METRICS
              : COMPETITION_METRICS;
        const trackedField =
          type === "health"
            ? "trackedHealthMetrics"
            : type === "performance"
              ? "trackedPerformanceMetrics"
              : "trackedCompetitionMetrics";
        const currentIds =
          (type === "health"
            ? profile?.trackedHealthMetrics
            : type === "performance"
              ? profile?.trackedPerformanceMetrics
              : profile?.trackedCompetitionMetrics) ??
          builtIns.map((m) => m.id);
        const next = [...currentIds, def.id];
        if (!profile) {
          void updateProfile({ [trackedField]: next });
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
  // Y/N's only possible values are 0 and 1, so the decimals setting
  // applies to the formatted average display. The form holds it fixed
  // at the EMPTY_DRAFT default so the user doesn't fiddle with a knob
  // whose effect is tangential to the Y/N concept.
  const decimalsDisabled = draft.topLevel === "yn";

  // Y/N is a constant preset that doesn't live in draft.levels (so the
  // user's Categorical edits survive a Y/N detour). Resolve the
  // effective levels here so both the y-range derivation and the
  // editor render see the right shape.
  const effectiveLevels =
    draft.topLevel === "yn" ? YN_LEVELS : draft.levels;

  // For ordinal kinds the y-axis is derived from levels at submit-time;
  // mirror that derivation into the (disabled) display fields so users
  // see what will actually be saved instead of stale Numeric defaults.
  // Partial entries (some level values blank) still show the range over
  // whatever's been filled in; an empty table shows blanks.
  const yRangeDisplay =
    draft.topLevel === "numeric"
      ? { top: draft.yTopRaw, bottom: draft.yBottomRaw }
      : deriveLevelRangeDisplay(effectiveLevels);

  return (
    <form className={css.form} onSubmit={handleSubmit} noValidate>
      <fieldset className={css.typeChooser}>
        <legend className={css.typeChooserLegend}>Type</legend>
        <label className={css.typeOption}>
          <input
            type="radio"
            className={radioCss.radio}
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
            className={radioCss.radio}
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
            className={radioCss.radio}
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

      <If condition={isDuplicateName}>
        <div className={css.nameWarning} role="alert">
          <p className={css.nameWarningText}>
            A metric named "{trimmedName}" already exists.
          </p>
          <button
            type="button"
            className={css.nameWarningAction}
            onClick={() => {
              if (suggestedName) update("name", suggestedName);
            }}
          >
            Use "{suggestedName}" instead
          </button>
        </div>
      </If>

      <If condition={draft.topLevel !== "numeric"}>
        <div className={css.levelsBlock}>
          <label className={css.fieldLabel}>Levels</label>
          <CustomMetricLevelsEditor
            levels={effectiveLevels}
            onChange={(next) => update("levels", next)}
            readOnly={draft.topLevel === "yn"}
          />
        </div>
      </If>

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
          value={yRangeDisplay.top}
          disabled={yAxisDisabled}
          onChange={(e) => update("yTopRaw", e.target.value)}
        />
        <TextField
          id="cm-ybot"
          label="Y-axis bottom"
          type="number"
          inputMode="decimal"
          value={yRangeDisplay.bottom}
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
        disabled={decimalsDisabled}
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
        <button type="submit" className={css.primary} disabled={isDuplicateName}>
          Save
        </button>
      </div>
    </form>
  );
}
