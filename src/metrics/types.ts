import type { ComponentType, SVGProps } from "react";

export type MetricType = "wellness" | "performance";
export type MetricInputType = "numeric" | "radio" | "tree" | "colorScale";

export interface MetricDefinition {
  id: string;
  name: string;
  // Long-form unit ("hr/night", "g/kg/day"). MetricDetail / info screens
  // render this; the log's record-input column renders displayUnit when
  // present, falling back to unit.
  unit: string;
  displayUnit?: string;
  // Per-metric hint rendered below the record-input on the log screen.
  // E.g., Lean Mass: "Entered 2-3×/yr".
  hint?: string;
  type: MetricType;
  whoCollects: string;
  howCollected: string;
  description: string;
  min?: number;
  max?: number;
  inputType: MetricInputType;
  // Per-metric glyph imported via vite-plugin-svgr from src/icons/metric-*.svg.
  // MetricDetail's section heading consumes this; addable metrics that ship
  // without a designer-final icon leave Icon undefined and fall back to a
  // generic placeholder at the call site.
  Icon?: ComponentType<SVGProps<SVGSVGElement>>;
  // "Learn more about [metric]" external link rendered under MetricDetail's
  // Definition section (prototype HTML around line 6664-6665).
  learnMoreUrl?: string;
  // Reference links rendered as a "References" / "Reference" section in
  // MetricDetail (prototype lines 6742-6750). Each entry is a {title, url}
  // pair; renders as a list of clickable external links.
  references?: Array<{ title: string; url: string }>;
  // Verbatim "Estimated Range" string from the prototype's metricDetails
  // entry (e.g., "0-100%", "8 levels (pale yellow -> dark yellow/amber)").
  // MetricDetail prefers this over min/max when set, since the prototype's
  // string carries unit + qualifier context that min/max alone can't.
  estimatedRange?: string;
  // Verbatim "When / How Many Times Collected" string (e.g., "Daily",
  // "2-3x/year"). MetricDetail's "When Collected" section reads this; the
  // log-table per-row hint stays on `hint`.
  whenCollected?: string;
}
