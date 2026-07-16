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
// Written as if/return rather than a nested ternary so TypeScript narrows
// `levels` to non-undefined inside the guard: ScaleCards and LevelRadioGroup
// then typecheck without a non-null assertion. This is also the structure the
// per-type pages used before the merge.
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

  // Built-in ordinals (currently winningPercentage) carry levels on the
  // registry entry; customs carry them on the def. Built-in wins, matching the
  // branch order the per-type pages used.
  const levels =
    builtInDef?.inputType === "ordinal" ? builtInDef.levels : customDef?.levels;
  const isOrdinal =
    builtInDef?.inputType === "ordinal" || customDef?.primitive === "ordinal";

  if (isOrdinal && levels) {
    if (isYesNoLevels(levels)) {
      return (
        <LevelRadioGroup
          levels={levels}
          value={ordinalValue}
          onChange={(next) => setValue(String(next))}
          labelledBy={labelledBy}
        />
      );
    }
    return (
      <ScaleCards
        levels={levels}
        colors={resolveScaleColors({ metricId: id, levels })}
        value={ordinalValue}
        onChange={(next) => setValue(String(next))}
        labelledBy={labelledBy}
      />
    );
  }

  return (
    <LogRecordInput
      metricId={id}
      // tracked.type is the 3-way MetricType shared across all log rows
      // (health/performance/competition); this component only ever receives
      // performance or competition items (health has its own row component),
      // so the narrower cast here is safe.
      metricType={type as "performance" | "competition"}
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
