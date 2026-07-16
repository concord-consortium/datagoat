import { Link } from "react-router-dom";
import { MetricInputRow } from "./MetricInputRow";
import { isYesNoLevels } from "../../metrics/yesNo";
import type { MetricDefinition } from "../../metrics/types";
import type { CustomMetricDef } from "../../types/customMetrics";
import type { HealthEntry } from "../../types/data";
import type { HealthSummary } from "./useHealthSummaries";
import type { TrackedMetric } from "./useTrackedMetrics";
import rowCss from "./MetricInputRow.module.css";

export interface HealthMetricRowProps {
  tracked: TrackedMetric;
  entry: HealthEntry;
  summary: HealthSummary;
  competitionTerm: string;
  setEntry: (partial: Partial<HealthEntry>) => void;
}

// Adapts a custom health metric to the MetricDefinition shape MetricInputRow
// expects.
function adaptCustom(def: CustomMetricDef): MetricDefinition {
  return {
    id: def.id,
    name: def.name,
    unit: def.unit ?? "",
    displayUnit: def.unit ?? "",
    type: "health",
    whoCollects: "",
    howCollected: "",
    description: "",
    inputType: "numeric",
    timePrecision: def.timePrecision,
  };
}

export function HealthMetricRow({
  tracked,
  entry,
  summary,
  competitionTerm,
  setEntry,
}: HealthMetricRowProps) {
  const id = tracked.id;
  const detailHref = `/health/${id}`;

  function setNumericField<K extends keyof HealthEntry>(field: K, raw: string) {
    if (raw === "") {
      setEntry({ [field]: undefined } as Partial<HealthEntry>);
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;
    setEntry({ [field]: numeric } as Partial<HealthEntry>);
  }

  function setCustomMetric(metricId: string, raw: string) {
    if (raw === "") {
      setEntry({ customMetrics: { [metricId]: undefined } });
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;
    setEntry({ customMetrics: { [metricId]: numeric } });
  }

  const builtIn = tracked.builtInDef;
  if (builtIn) {
    if (id === "hydration") {
      return (
        <MetricInputRow
          {...summary}
          metric={builtIn}
          inputType="colorScale"
          // Hydration is optional (undefined = not entered). The ColorScale
          // component renders "no selection" when value is 0 or undefined,
          // preserving the undefined semantics throughout the data flow.
          value={entry.hydration}
          onChange={(level: number) => setEntry({ hydration: level })}
          detailHref={detailHref}
        />
      );
    }
    if (id === "availability") {
      return (
        <MetricInputRow
          // No summary: availability is a practice/game yes-no tree with no
          // scalar value, so a 7-day average and sparkline are meaningless
          // (readHealthMetric reduces it to a 0/1 sentinel that formats as a
          // misleading "0%" on its 0..100 axis). Renders "—" until it gets
          // a real scalar definition.
          metric={builtIn}
          inputType="tree"
          competitionTerm={competitionTerm}
          value={entry.availability}
          onChange={(next: HealthEntry["availability"]) =>
            setEntry({ availability: next })
          }
          detailHref={detailHref}
        />
      );
    }
    if (id === "relativeProteinIntake") {
      // Auto-calculated metric per the design source. The derivation
      // (protein / leanMass with profile weighting) is a follow-up; for now
      // the row shows a placeholder so the metric is visible without
      // pretending it has an input control.
      return (
        <tr className={rowCss.metricInputRow}>
          <td>
            {/* Em dash is the empty-value glyph across every row
                (MetricInputRow renders `avgLabel ?? "—"`), not prose. */}
            <div className={rowCss.trackCell}>—</div>
          </td>
          <td className={rowCss.metricName}>
            <Link to={detailHref} className={rowCss.metricLink}>
              {builtIn.name}
            </Link>
          </td>
          <td>
            <span className={rowCss.placeholderCell}>
              🚧 Auto-calculated · coming soon
            </span>
          </td>
        </tr>
      );
    }
    // Numeric named-field built-ins. The original five metrics store values
    // as typed fields on HealthEntry; the chart engine's readHealthMetric has
    // matching `case` branches.
    if (id === "sleepTime" || id === "sleepEfficiency" || id === "protein" || id === "leanMass") {
      const fieldKey = id as keyof Pick<
        HealthEntry,
        "sleepTime" | "sleepEfficiency" | "protein" | "leanMass"
      >;
      const live = entry[fieldKey];
      const stringValue =
        typeof live === "number" && Number.isFinite(live) ? String(live) : "";
      return (
        <MetricInputRow
          {...summary}
          metric={builtIn}
          inputType="numeric"
          value={stringValue}
          onChange={(raw: string) => setNumericField(fieldKey, raw)}
          detailHref={detailHref}
        />
      );
    }
    // Generic built-in path for newer metrics (Mood, plus off-by-default
    // additions). Values live in the `customMetrics` map (misleading name
    // kept until a follow-up renames the field to `metrics`). Dispatches on
    // the registry's inputType so adding another ordinal/numeric built-in
    // needs only a registry entry, no new branch here.
    if (builtIn.inputType === "ordinal" && builtIn.levels) {
      const live = entry.customMetrics?.[id];
      const ordinalValue =
        typeof live === "number" && Number.isFinite(live) ? live : undefined;
      return (
        <MetricInputRow
          {...summary}
          metric={builtIn}
          inputType="ordinal"
          levels={builtIn.levels}
          value={ordinalValue}
          onChange={(next: number) => setCustomMetric(id, String(next))}
          detailHref={detailHref}
        />
      );
    }
    const live = entry.customMetrics?.[id];
    const stringValue =
      typeof live === "number" && Number.isFinite(live) ? String(live) : "";
    return (
      <MetricInputRow
        {...summary}
        metric={builtIn}
        inputType="numeric"
        value={stringValue}
        onChange={(raw: string) => setCustomMetric(id, raw)}
        detailHref={detailHref}
      />
    );
  }

  const def = tracked.customDef;
  if (!def) return null;

  if (def.primitive === "ordinal" && def.levels) {
    const live = entry.customMetrics?.[id];
    const ordinalValue =
      typeof live === "number" && Number.isFinite(live) ? live : undefined;
    return (
      <MetricInputRow
        {...summary}
        inputType={isYesNoLevels(def.levels) ? "radio" : "ordinal"}
        metric={adaptCustom(def)}
        levels={def.levels}
        value={ordinalValue}
        onChange={(next: number) => setCustomMetric(id, String(next))}
        detailHref={detailHref}
      />
    );
  }
  // Nominal customs are schema-reserved but not yet exposed in the form. If a
  // doc with primitive "nominal" surfaces (externally written), don't fall
  // through to the numeric input - that would let users log a number against a
  // label-valued metric and corrupt the entry shape. Skip the row.
  if (def.primitive === "nominal") return null;

  const live = entry.customMetrics?.[id];
  // Finite numbers (incl. 0 and negatives for customs with yBottomRaw < 0)
  // render verbatim. A missing key (undefined) is "not logged" and renders
  // as blank.
  const stringValue =
    typeof live === "number" && Number.isFinite(live)
      ? String(live)
      : typeof live === "string"
        ? live
        : "";
  return (
    <MetricInputRow
      {...summary}
      metric={adaptCustom(def)}
      inputType="numeric"
      value={stringValue}
      onChange={(raw: string) => setCustomMetric(id, raw)}
      detailHref={detailHref}
      // Open the keystroke filter to a leading `-` only when the metric's
      // range goes below 0; otherwise typing minus stays blocked, matching
      // built-in behavior.
      allowNegative={(def.yBottomRaw ?? 0) < 0}
    />
  );
}
