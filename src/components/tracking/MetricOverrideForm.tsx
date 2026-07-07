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
import { getCompTermPlural } from "../../data/competitionTerms";
import { goalDeterminationText, resolveGoalText } from "../../data/metricGoals";
import { If } from "../common/If";
import { TextField } from "../form/TextField";
import { ScheduleField } from "../form/ScheduleField";
import { TimeInput } from "../logs/TimeInput";
import { resolveTimeLayout } from "../../utils/timeValue";
import {
  resolveSchedule,
  schedulesEqual,
  type MetricSchedule,
} from "../../types/metricSchedule";
import type { MetricDefinition } from "../../metrics/types";
import css from "./CustomMetricForm.module.css";

interface MetricOverrideFormProps {
  metric: MetricDefinition;
}

interface OverrideFieldProps {
  metric: MetricDefinition;
  isTime: boolean;
  // Doubles as the field id (number branch) and testid (time branch);
  // the time label derives its id as `${id}-label`.
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  // Current effective value shown as placeholder when the field is blank
  // (the base config bound the user is overriding). Omitted for the
  // always-prefilled Goal field.
  placeholderValue?: number;
  // Time branch only: notified when the in-progress entry's validity flips.
  onErrorChange?: (hasError: boolean) => void;
}

// One labelled editable field for the override form. Time metrics render
// the multi-field TimeInput; everything else renders a plain number
// TextField. Extracted so the Goal / Y-axis-top / Y-axis-bottom trio
// stays in sync instead of being three copy-pasted branches.
function OverrideField({
  metric,
  isTime,
  id,
  label,
  value,
  onChange,
  placeholderValue,
  onErrorChange,
}: OverrideFieldProps) {
  if (isTime) {
    const labelId = `${id}-label`;
    return (
      <div data-testid={id}>
        <label className={css.fieldLabel} id={labelId}>
          {label}
        </label>
        <TimeInput
          metric={metric}
          value={value}
          onChange={onChange}
          labelledBy={labelId}
          placeholderValue={placeholderValue}
          onErrorChange={onErrorChange}
          labelPrefix={label}
        />
      </div>
    );
  }
  return (
    <TextField
      id={id}
      label={label}
      type="number"
      inputMode="decimal"
      step="any"
      value={value}
      placeholder={placeholderValue !== undefined ? String(placeholderValue) : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
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
  const isTime = resolveTimeLayout(metric) !== null;
  const profileKey = profile
    ? `${capitalizeGender(profile.gender)}/${capitalizeAthleteType(
        profile.athleteType,
      )}`
    : "";
  // Pass the user's competition term so the Availability recommended-goal
  // copy reads "practices and matches/meets/..." instead of always
  // falling back to "games" (mirrors the MetricDetail call site).
  const compTermPlural = getCompTermPlural(profile?.competitionTerm ?? "");
  const goalText = resolveGoalText(metric.id, profileKey, compTermPlural);
  // One template for every metric (DGT-48) - the metric name and the
  // athlete type are the only substitutions. Needs a loaded profile
  // for the athlete type, so it stays null until the profile resolves.
  const determinationText = profile
    ? goalDeterminationText(
        capitalizeAthleteType(profile.athleteType),
        metric.name,
      )
    : null;

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
  // Effective schedule: the user's override, else the metric's built-in
  // default, else irregular. Edited locally; on save we only persist an
  // override when it differs from the built-in default (otherwise clear).
  const [schedule, setSchedule] = useState<MetricSchedule>(() =>
    resolveSchedule(metric.schedule, existing?.schedule),
  );
  const [error, setError] = useState<string | null>(null);
  // Per-field flag for TimeInputs holding an in-progress invalid entry.
  // Those entries never propagate to goalRaw/yTopRaw/yBottomRaw, so
  // without this the form would save the last-committed (stale) value
  // while the user sees a different, error-flagged entry.
  const [timeFieldErrors, setTimeFieldErrors] = useState<
    Record<string, boolean>
  >({});
  const setTimeFieldError = (id: string, hasError: boolean) =>
    setTimeFieldErrors((prev) => ({ ...prev, [id]: hasError }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (Object.values(timeFieldErrors).some(Boolean)) {
      setError("Please fix the highlighted time fields before saving.");
      return;
    }
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

    // Schedule: only override when it differs from the metric's built-in
    // default. Matching the default clears any prior override (so the
    // metric tracks future default changes) rather than pinning it.
    if (schedulesEqual(schedule, resolveSchedule(metric.schedule))) {
      if (existing?.schedule !== undefined) patch.schedule = null;
    } else {
      patch.schedule = schedule;
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
      {/* Goal-determination guidance: one template for every metric,
          with the athlete type and metric name filled in. Hidden until
          the profile loads (the athlete type comes from it). */}
      <If condition={determinationText !== null}>
        <p className={css.hint}>{determinationText}</p>
      </If>
      <If condition={goalText !== null}>
        <p className={css.hint}>Recommended goal: {goalText}.</p>
      </If>

      <OverrideField
        metric={metric}
        isTime={isTime}
        id="mo-goal"
        label="Goal"
        value={goalRaw}
        onChange={setGoalRaw}
        onErrorChange={(hasError) => setTimeFieldError("mo-goal", hasError)}
      />

      <div className={css.row}>
        <OverrideField
          metric={metric}
          isTime={isTime}
          id="mo-ytop"
          label="Y-axis top (optional)"
          value={yTopRaw}
          onChange={setYTopRaw}
          placeholderValue={base.yTopRaw}
          onErrorChange={(hasError) => setTimeFieldError("mo-ytop", hasError)}
        />
        <OverrideField
          metric={metric}
          isTime={isTime}
          id="mo-ybot"
          label="Y-axis bottom (optional)"
          value={yBottomRaw}
          onChange={setYBottomRaw}
          placeholderValue={base.yBottomRaw}
          onErrorChange={(hasError) => setTimeFieldError("mo-ybot", hasError)}
        />
      </div>

      <ScheduleField
        idPrefix="mo-schedule"
        value={schedule}
        onChange={setSchedule}
      />

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
