import type { MetricDefinition } from "../metrics/types";
import type { CustomMetricDef, CustomMetricLevel } from "../types/customMetrics";
import type { AttributeSpec } from "./codapApi";
import {
  formatDecimalToTime,
  layoutUnits,
  resolveTimeLayout,
  type TimeLayout,
  type TimeUnit,
} from "../utils/timeValue";

// A stored metric value read off an entry: a number, a string, or
// null/absent when the metric was not logged that day.
export type RawValue = string | number | null;

export type MetricFlavor =
  | "numeric"
  | "time"
  | "ordinal"
  | "nominal"
  | "compound";

// A metric flattened to just what the CODAP export needs, with its
// flavor resolved so metricColumns() can pick the right column shape.
export interface NormalizedMetric {
  id: string;
  name: string;
  unit?: string;
  flavor: MetricFlavor;
  levels?: CustomMetricLevel[];
  timeLayout?: TimeLayout;
}

// One CODAP attribute (column): its spec plus how to turn a raw stored
// value into that column's cell. Bundling them keeps the attribute name
// and the row key in lockstep.
export interface ExportColumn {
  spec: AttributeSpec;
  toValue: (raw: RawValue) => string | number | null;
}

const COARSE_UNIT_LABEL: Record<TimeUnit, string> = {
  h: "hr",
  m: "min",
  s: "sec",
};

// The clock format label for a time layout, coarsest -> finest: the
// coarsest unit is a single letter, finer units are doubled. So [h,m]
// -> "h:mm", [m,s] -> "m:ss", [h,m,s] -> "h:mm:ss", [s] -> "s".
export function clockPattern(layout: TimeLayout): string {
  return layoutUnits(layout)
    .map((u, i) => (i === 0 ? u : `${u}${u}`))
    .join(":");
}

export function normalizeMetric(
  def: MetricDefinition | CustomMetricDef,
): NormalizedMetric {
  const isCustom = "primitive" in def;
  const id = def.id;
  const name = def.name;
  const displayUnit = isCustom ? undefined : def.displayUnit;
  const unit = displayUnit ?? def.unit;

  const layout = resolveTimeLayout({
    unit: def.unit,
    displayUnit,
    timePrecision: def.timePrecision,
  });
  if (layout) {
    return {
      id,
      name,
      unit: COARSE_UNIT_LABEL[layout.coarsest],
      flavor: "time",
      timeLayout: layout,
    };
  }

  if (isCustom) {
    if (def.primitive === "ordinal")
      return { id, name, flavor: "ordinal", levels: def.levels };
    if (def.primitive === "nominal")
      return { id, name, flavor: "nominal", levels: def.levels };
    return { id, name, unit: def.unit, flavor: "numeric" };
  }

  if (def.inputType === "ordinal")
    return { id, name, flavor: "ordinal", levels: def.levels };
  if (def.inputType === "tree") return { id, name, flavor: "compound" };
  return { id, name, unit, flavor: "numeric" };
}

// Map a stored value to its level label. Falls back to the raw string
// (nominal customs store the label directly) or a stringified number
// when no level matches.
function labelFor(
  levels: CustomMetricLevel[] | undefined,
  raw: RawValue,
): string | null {
  if (raw == null) return null;
  const hit = levels?.find((l) => l.value === raw);
  if (hit) return hit.label;
  return typeof raw === "string" ? raw : String(raw);
}

function numericColumn(name: string, unit?: string): ExportColumn {
  return {
    spec: { name, type: "numeric", ...(unit ? { unit } : {}) },
    toValue: (raw) => (typeof raw === "number" ? raw : null),
  };
}

export function metricColumns(metric: NormalizedMetric): ExportColumn[] {
  switch (metric.flavor) {
    case "numeric":
      return [numericColumn(metric.name, metric.unit)];
    case "time": {
      const layout = metric.timeLayout as TimeLayout;
      return [
        numericColumn(metric.name, metric.unit),
        {
          spec: {
            name: `${metric.name} (${clockPattern(layout)})`,
            type: "categorical",
          },
          toValue: (raw) =>
            typeof raw === "number" ? formatDecimalToTime(raw, layout) : null,
        },
      ];
    }
    case "ordinal":
      return [
        {
          spec: { name: metric.name, type: "categorical" },
          toValue: (raw) => labelFor(metric.levels, raw),
        },
        {
          spec: { name: `${metric.name} (level)`, type: "numeric" },
          toValue: (raw) => (typeof raw === "number" ? raw : null),
        },
      ];
    case "nominal":
      return [
        {
          spec: { name: metric.name, type: "categorical" },
          toValue: (raw) => labelFor(metric.levels, raw),
        },
      ];
    case "compound":
      return [
        {
          spec: { name: metric.name, type: "categorical" },
          toValue: (raw) =>
            typeof raw === "string" ? raw : raw == null ? null : String(raw),
        },
      ];
  }
}
