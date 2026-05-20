import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  useMetricOverrides,
  type MetricOverridePatch,
} from "../../contexts/MetricOverridesContext";
import { useUser } from "../../contexts/UserContext";
import {
  capitalizeAthleteType,
  capitalizeGender,
  lookupGoalLine,
} from "../../charts/chartSeries";
import { getBaseMetricChartConfig } from "../../charts/metricChartConfig";
import { resolveGoalText } from "../../data/metricGoals";
import { If } from "../common/If";
import { TextField } from "../form/TextField";
import type { MetricDefinition } from "../../metrics/types";
import css from "./CustomMetricForm.module.css";

interface MetricOverrideFormProps {
  metric: MetricDefinition;
}

// Edit form for a built-in metric: only the goal and the chart y-axis
// bounds are editable. Everything else is shown disabled / read-only.
export function MetricOverrideForm({ metric }: MetricOverrideFormProps) {
  const navigate = useNavigate();
  const { getOverride, saveOverride } = useMetricOverrides();
  const { loadState } = useUser();
  const profile = loadState.status === "loaded" ? loadState.profile : null;

  const existing = getOverride(metric.id);
  const base = getBaseMetricChartConfig(metric.id);
  const profileKey = profile
    ? `${capitalizeGender(profile.gender)}/${capitalizeAthleteType(
        profile.athleteType,
      )}`
    : "";
  const goalText = resolveGoalText(metric.id, profileKey);

  // Initial values. Goal is required, so it always shows the current
  // effective goal (override > profile-keyed > static default). Y-axis
  // fields are *optional* overrides: when there is no axis override
  // they start blank, and the base config's value renders as a
  // placeholder. Clearing them later removes the override.
  const [goalRaw, setGoalRaw] = useState<string>(() => {
    const effective =
      existing?.goalRaw ?? lookupGoalLine(metric.id, profileKey);
    return effective === undefined ? "" : String(effective);
  });
  const [yTopRaw, setYTopRaw] = useState<string>(
    existing?.yTopRaw !== undefined ? String(existing.yTopRaw) : "",
  );
  const [yBottomRaw, setYBottomRaw] = useState<string>(
    existing?.yBottomRaw !== undefined ? String(existing.yBottomRaw) : "",
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (goalRaw.trim() === "") {
      setError("Goal is required.");
      return;
    }
    const goal = Number(goalRaw);
    if (!Number.isFinite(goal)) {
      setError("Goal must be a number.");
      return;
    }
    // Range check: the goal must fit the metric's built-in data range
    // when the definition declares both bounds.
    if (
      metric.min !== undefined &&
      metric.max !== undefined &&
      (goal < metric.min || goal > metric.max)
    ) {
      setError(`Goal must be between ${metric.min} and ${metric.max}.`);
      return;
    }

    // Y-axis is an all-or-nothing pair: both blank means no axis
    // override, both filled means a complete pair to validate. One of
    // two blank is ambiguous and rejected.
    const topBlank = yTopRaw.trim() === "";
    const bottomBlank = yBottomRaw.trim() === "";
    if (topBlank !== bottomBlank) {
      setError("Set both y-axis fields or leave both blank.");
      return;
    }

    const patch: MetricOverridePatch = { goalRaw: goal };

    if (!topBlank && !bottomBlank) {
      const top = Number(yTopRaw);
      const bottom = Number(yBottomRaw);
      if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
        setError("Y-axis top and y-axis bottom must be numbers.");
        return;
      }
      // The override must keep the base config's axis orientation. Most
      // metrics ascend (top > bottom); an inverted metric (hydration)
      // descends (top < bottom).
      const baseAscending = base.yTopRaw > base.yBottomRaw;
      if (baseAscending && top <= bottom) {
        setError("Y-axis top must be greater than y-axis bottom.");
        return;
      }
      if (!baseAscending && top >= bottom) {
        setError("Y-axis top must be less than y-axis bottom.");
        return;
      }
      patch.yTopRaw = top;
      patch.yBottomRaw = bottom;
    } else {
      // Both blank — clear any prior axis override so the stored doc
      // stops shadowing the base config.
      if (existing?.yTopRaw !== undefined) patch.yTopRaw = null;
      if (existing?.yBottomRaw !== undefined) patch.yBottomRaw = null;
    }

    try {
      await saveOverride(metric.id, patch);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to save metric override", err);
      setError("Couldn't save your changes. Please try again.");
      return;
    }
    navigate("/setup/tracking");
  }

  return (
    <form className={css.form} onSubmit={handleSubmit} noValidate>
      <TextField
        id="mo-name"
        label="Name"
        value={metric.name}
        disabled
      />
      <TextField
        id="mo-unit"
        label="Unit"
        value={metric.displayUnit ?? metric.unit}
        disabled
      />

      <If condition={existing !== undefined}>
        <p className={css.hint}>This metric has been customized.</p>
      </If>
      {/* Placeholder for metric-specific goal-determination text.
          The actual per-metric paragraphs (story example: "As a
          [Athlete Type] athlete, your lean mass target should be
          tailored to your sport-specific demands ...") will be added
          alongside data-model support in DGT-62. */}
      <p className={css.hint}>
        Metric-specific goal value determination will be shown here.
      </p>
      <If condition={goalText !== null}>
        <p className={css.hint}>Recommended goal: {goalText}.</p>
      </If>

      <TextField
        id="mo-goal"
        label="Goal"
        type="number"
        inputMode="decimal"
        value={goalRaw}
        onChange={(e) => setGoalRaw(e.target.value)}
      />

      <div className={css.row}>
        <TextField
          id="mo-ytop"
          label="Y-axis top (optional)"
          type="number"
          inputMode="decimal"
          value={yTopRaw}
          placeholder={String(base.yTopRaw)}
          onChange={(e) => setYTopRaw(e.target.value)}
        />
        <TextField
          id="mo-ybot"
          label="Y-axis bottom (optional)"
          type="number"
          inputMode="decimal"
          value={yBottomRaw}
          placeholder={String(base.yBottomRaw)}
          onChange={(e) => setYBottomRaw(e.target.value)}
        />
      </div>

      {error && <p className={css.error}>{error}</p>}

      <div className={css.actions}>
        <button
          type="button"
          className={css.secondary}
          onClick={() => navigate("/setup/tracking")}
        >
          Cancel
        </button>
        <button type="submit" className={css.primary}>
          Save
        </button>
      </div>
    </form>
  );
}
