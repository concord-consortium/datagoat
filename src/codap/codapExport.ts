// CODAP export data model. The plugin sends three separate per-category
// datasets (Health / Performance / Competition), each a WIDE, date-keyed
// table: one row per date, one or two attributes per metric. This is
// deliberately NOT a single long `date, category, metric, value` table -
// CODAP's value is dragging an attribute onto an axis, which needs
// metrics-as-wide-attributes; a shared `value` column mixes types and isn't
// draggable per metric, and splitting by category avoids a competition-day
// row carrying all-empty health columns.
//
// Column policy: emit a number wherever a number is meaningful (so it
// graphs and averages) and add a display companion wherever the raw number
// reads poorly - so time metrics emit [numeric, clock string] and ordinals
// emit [label, numeric level]. A single-attribute alternative was rejected:
// it forces choosing between readable display and numeric analysis.
import type { MetricDefinition } from "../metrics/types";
import type { CustomMetricDef, CustomMetricLevel } from "../types/customMetrics";
import type { AttributeSpec, DatasetRow } from "./codapApi";
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
  // colorScale inputs (e.g. hydration's 8-point scale) fall through to here:
  // an inherently numeric scale, not a label set, so numeric is correct.
  return { id, name, unit, flavor: "numeric" };
}

// Map a stored value to its level label. Ordinal metrics persist the
// level's numeric value (not its label), so the lookup matches on
// `l.value === raw`. Falls back to the raw string or a stringified number
// when no level matches - nominal custom input is not fully wired yet, so
// that string passthrough is defensive for when it is.
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

// Resolve a category's tracked metric ids to normalized metrics, in the
// order the ids appear. Builtins win ties with customs (ids are unique
// across the two in practice). Unknown ids (stale profile entries) are
// skipped so the export never invents a column with no definition.
export function resolveTrackedMetrics(
  trackedIds: string[],
  builtins: MetricDefinition[],
  customs: CustomMetricDef[],
): NormalizedMetric[] {
  const byId = new Map<string, MetricDefinition | CustomMetricDef>();
  for (const c of customs) byId.set(c.id, c);
  for (const b of builtins) byId.set(b.id, b);
  const out: NormalizedMetric[] = [];
  for (const id of trackedIds) {
    const def = byId.get(id);
    if (def) out.push(normalizeMetric(def));
  }
  return out;
}

// Build a wide, date-keyed dataset: a leading `date` attribute plus each
// metric's one or two columns, and one row per entry. `readRaw` pulls a
// metric's stored value off an entry (health reads typed fields + the
// customMetrics bag; competition/performance read the metrics bag).
//
// Assumes one measurement per (metric, date) - true today, since each
// entry is a Firestore doc keyed by date. A future multiple-per-day story
// would add an `index` attribute and change the upsert key to (date,
// index); the wide attribute layout itself would not change.
export function buildDataset<T extends { date: string }>(
  metrics: NormalizedMetric[],
  entries: T[],
  readRaw: (entry: T, metricId: string) => RawValue,
): { attributes: AttributeSpec[]; rows: DatasetRow[] } {
  const columns = metrics.flatMap((m) =>
    metricColumns(m).map((c) => ({ ...c, metricId: m.id })),
  );
  const attributes: AttributeSpec[] = [
    { name: "date", type: "date" },
    ...columns.map((c) => c.spec),
  ];
  const rows = entries.map((e) => {
    const row: DatasetRow = { date: e.date };
    for (const c of columns) {
      row[c.spec.name] = c.toValue(readRaw(e, c.metricId));
    }
    return row;
  });
  return { attributes, rows };
}
