import { useId } from "react";
import { Link } from "react-router-dom";
import { LevelRadioGroup } from "./LevelRadioGroup";
import { LogRecordInput } from "./LogRecordInput";
import { ScaleCards } from "./ScaleCards";
import { resolveScaleColors } from "../../data/scaleColors";
import { isYesNoLevels } from "../../metrics/yesNo";
import type { TrackedMetric } from "./useTrackedMetrics";
import css from "./PerfCompMetricRow.module.css";

export interface PerfCompMetricRowProps {
  tracked: TrackedMetric;
  // Raw stored value for the current date.
  value: number | string | undefined;
  // Pre-formatted leftmost cell. Competition passes a running total,
  // Performance passes the latest value; this component does not compute
  // either, so the caller owns the per-type semantics.
  summaryCell: string;
  setValue: (raw: string) => void;
}

interface RecordCellProps {
  tracked: TrackedMetric;
  stringValue: string;
  ordinalValue: number | undefined;
  filled: boolean;
  setValue: (raw: string) => void;
  labelledBy: string;
}

// Widget for the Record cell.
//
// The built-in-ordinal and custom-ordinal cases are separate if/return
// branches (not a combined ternary) so TypeScript narrows each def's `levels`
// to non-undefined inside its own guard, with no non-null assertion. This is
// also the branch order and precedence the per-type pages used before the
// merge: built-in ordinals always render as scale cards, and only the
// custom-ordinal branch ever routes to the Yes/No radio group.
function RecordCell({
  tracked,
  stringValue,
  ordinalValue,
  filled,
  setValue,
  labelledBy,
}: RecordCellProps) {
  const { id, type, builtInDef, customDef } = tracked;

  // Nominal customs are schema-reserved but not yet exposed in the form. If a
  // doc with primitive "nominal" surfaces (externally written), render nothing
  // rather than falling through to the numeric input - that would let users log
  // a number against a label-valued metric and corrupt the entry shape.
  if (customDef?.primitive === "nominal") return null;

  // Health rows never reach this component (the dispatcher routes them to
  // HealthMetricRow). Guarding the local rather than casting keeps the
  // narrowing honest and fails safe if that ever changes.
  if (type === "health") return null;

  // Built-in ordinals (currently winningPercentage) always render as scale
  // cards, matching the per-type pages: only the custom-ordinal branch below
  // ever routed to the Yes/No radio group.
  if (builtInDef?.inputType === "ordinal" && builtInDef.levels) {
    return (
      <ScaleCards
        levels={builtInDef.levels}
        colors={resolveScaleColors({ metricId: id, levels: builtInDef.levels })}
        value={ordinalValue}
        onChange={(next) => setValue(String(next))}
        labelledBy={labelledBy}
      />
    );
  }
  if (customDef?.primitive === "ordinal" && customDef.levels) {
    return isYesNoLevels(customDef.levels) ? (
      <LevelRadioGroup
        levels={customDef.levels}
        value={ordinalValue}
        onChange={(next) => setValue(String(next))}
        labelledBy={labelledBy}
      />
    ) : (
      <ScaleCards
        levels={customDef.levels}
        colors={resolveScaleColors({ metricId: id, levels: customDef.levels })}
        value={ordinalValue}
        onChange={(next) => setValue(String(next))}
        labelledBy={labelledBy}
      />
    );
  }

  return (
    <LogRecordInput
      metricId={id}
      metricType={type}
      builtInDef={builtInDef}
      customDef={customDef}
      value={stringValue}
      filled={filled}
      onChange={setValue}
      labelledBy={labelledBy}
      allowNegative={(customDef?.yBottomRaw ?? 0) < 0}
    />
  );
}

export function PerfCompMetricRow({
  tracked,
  value,
  summaryCell,
  setValue,
}: PerfCompMetricRowProps) {
  const nameCellId = useId();
  const { id, name, type } = tracked;

  // A stored 0 is valid logged data and must show as "0". A missing key
  // (undefined) is "not logged" and renders as blank.
  const stringValue =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string" && value !== ""
        ? value
        : "";
  const filled = stringValue !== "";
  const ordinalValue =
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

  return (
    <tr>
      <td className={css.colSummary}>{summaryCell}</td>
      <td id={nameCellId} className={css.colMetric}>
        <Link to={`/${type}/${id}`} className={css.metricLink}>
          {name}
        </Link>
      </td>
      <td className={css.colRecord}>
        <RecordCell
          tracked={tracked}
          stringValue={stringValue}
          ordinalValue={ordinalValue}
          filled={filled}
          setValue={setValue}
          labelledBy={nameCellId}
        />
      </td>
    </tr>
  );
}
