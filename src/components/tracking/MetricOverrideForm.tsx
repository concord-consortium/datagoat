import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMetricOverrides } from "../../contexts/MetricOverridesContext";
import { useUser } from "../../contexts/UserContext";
import {
  capitalizeAthleteType,
  capitalizeGender,
  lookupGoalLine,
} from "../../charts/chartSeries";
import { getBaseMetricChartConfig } from "../../charts/metricChartConfig";
import { resolveGoalText } from "../../data/metricGoals";
import { TextField } from "../form/TextField";
import type { MetricDefinition } from "../../metrics/types";
import css from "./CustomMetricForm.module.css";

interface MetricOverrideFormProps {
  type: "health" | "competition";
  metric: MetricDefinition;
}

// Edit form for a built-in metric: only the goal and the chart y-axis
// bounds are editable. Everything else is shown disabled / read-only.
export function MetricOverrideForm({ type: _type, metric }: MetricOverrideFormProps) {
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

  // Initial values. Goal: the current effective goal (lookupGoalLine
  // returns the override if present, else the profile/static default).
  // Axis: the existing override falling back to the base config — read
  // straight from the override doc so a fresh deep-link works before
  // the overlay effect has registered.
  const [goalRaw, setGoalRaw] = useState<string>(() => {
    const effective =
      existing?.goalRaw ?? lookupGoalLine(metric.id, profileKey);
    return effective === undefined ? "" : String(effective);
  });
  const [yTopRaw, setYTopRaw] = useState<string>(
    String(existing?.yTopRaw ?? base.yTopRaw),
  );
  const [yBottomRaw, setYBottomRaw] = useState<string>(
    String(existing?.yBottomRaw ?? base.yBottomRaw),
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const goal = Number(goalRaw);
    const top = Number(yTopRaw);
    const bottom = Number(yBottomRaw);
    if ([goal, top, bottom].some((v) => !Number.isFinite(v))) {
      setError("Goal, y-axis top, and y-axis bottom must be numbers.");
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
    try {
      await saveOverride(metric.id, {
        goalRaw: goal,
        yTopRaw: top,
        yBottomRaw: bottom,
      });
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
        onChange={() => {}}
      />
      <TextField
        id="mo-unit"
        label="Unit"
        value={metric.displayUnit ?? metric.unit}
        disabled
        onChange={() => {}}
      />

      {existing && (
        <p className={css.hint}>This metric has been customized.</p>
      )}
      {goalText && (
        <p className={css.hint}>Recommended goal: {goalText}.</p>
      )}

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
          label="Y-axis top"
          type="number"
          inputMode="decimal"
          value={yTopRaw}
          onChange={(e) => setYTopRaw(e.target.value)}
        />
        <TextField
          id="mo-ybot"
          label="Y-axis bottom"
          type="number"
          inputMode="decimal"
          value={yBottomRaw}
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
