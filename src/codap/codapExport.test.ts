import { describe, expect, it } from "vitest";
import type { MetricDefinition } from "../metrics/types";
import type { CustomMetricDef } from "../types/customMetrics";
import {
  clockPattern,
  metricColumns,
  normalizeMetric,
  type NormalizedMetric,
} from "./codapExport";
import { resolveTimeLayout } from "../utils/timeValue";

function health(partial: Partial<MetricDefinition>): MetricDefinition {
  return {
    id: "x",
    name: "X",
    unit: "",
    type: "health",
    whoCollects: "",
    howCollected: "",
    description: "",
    inputType: "numeric",
    ...partial,
  };
}

describe("clockPattern", () => {
  it("builds h:mm, m:ss, h:mm:ss, and seconds-only patterns", () => {
    expect(clockPattern(resolveTimeLayout({ unit: "hr", timePrecision: "m" })!)).toBe("h:mm");
    expect(clockPattern(resolveTimeLayout({ unit: "min", timePrecision: "s" })!)).toBe("m:ss");
    expect(clockPattern(resolveTimeLayout({ unit: "hr", timePrecision: "s" })!)).toBe("h:mm:ss");
    expect(clockPattern(resolveTimeLayout({ unit: "sec", timePrecision: "s" })!)).toBe("s");
  });
});

describe("normalizeMetric", () => {
  it("marks a plain numeric metric with its display unit", () => {
    const n = normalizeMetric(health({ id: "protein", name: "Protein Intake", unit: "g/kg/day", displayUnit: "g" }));
    expect(n).toMatchObject({ id: "protein", name: "Protein Intake", flavor: "numeric", unit: "g" });
  });

  it("marks a time metric and resolves its layout + coarse unit", () => {
    const n = normalizeMetric(health({ id: "sleepTime", name: "Total Sleep Time", unit: "hr/night", displayUnit: "hr", timePrecision: "m" }));
    expect(n.flavor).toBe("time");
    expect(n.unit).toBe("hr");
    expect(n.timeLayout).toEqual({ coarsest: "h", precision: "m" });
  });

  it("marks a custom numeric metric with its unit", () => {
    const def: CustomMetricDef = {
      id: "c1", ownerId: "u", name: "Vertical Jump", metricType: "performance",
      primitive: "numeric", unit: "in", inputType: "numeric", referenceUrl: "",
      createdAt: 0, updatedAt: 0,
    };
    expect(normalizeMetric(def)).toMatchObject({ flavor: "numeric", unit: "in", name: "Vertical Jump" });
  });
});

describe("metricColumns - numeric and time", () => {
  it("numeric produces one numeric column that passes numbers through and nulls non-numbers", () => {
    const cols = metricColumns({ id: "protein", name: "Protein Intake", flavor: "numeric", unit: "g" });
    expect(cols).toHaveLength(1);
    expect(cols[0].spec).toEqual({ name: "Protein Intake", type: "numeric", unit: "g" });
    expect(cols[0].toValue(42)).toBe(42);
    expect(cols[0].toValue(null)).toBeNull();
    expect(cols[0].toValue("skipped")).toBeNull();
  });

  it("time produces a numeric column plus a clock-string companion", () => {
    const metric: NormalizedMetric = {
      id: "sleepTime", name: "Total Sleep Time", flavor: "time", unit: "hr",
      timeLayout: { coarsest: "h", precision: "m" },
    };
    const cols = metricColumns(metric);
    expect(cols.map((c) => c.spec)).toEqual([
      { name: "Total Sleep Time", type: "numeric", unit: "hr" },
      { name: "Total Sleep Time (h:mm)", type: "categorical" },
    ]);
    expect(cols[0].toValue(7)).toBe(7);
    expect(cols[1].toValue(7)).toBe("7:00");
    expect(cols[1].toValue(null)).toBeNull();
  });
});
