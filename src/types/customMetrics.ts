export type CustomMetricType = "health" | "performance" | "competition";

// `inputType` is orthogonal to `primitive`. Today numeric metrics render
// as "numeric" and ordinal metrics render as "radio"; a future story can
// add a "menu" / "select" widget by extending this union without
// touching the primitive enum.
export type CustomMetricInputType = "numeric" | "radio";

export type CustomMetricPrimitive = "numeric" | "ordinal" | "nominal";

export interface CustomMetricLevel {
  label: string;
  // Present => ordinal level (numeric corollary). Absent => nominal
  // level (no meaningful number). The form enforces "all-or-none"
  // per metric: every level in an ordinal metric carries a value,
  // and every level in a nominal metric omits it.
  value?: number;
  // Optional color swatch. Saved when the user fills it in; the log
  // row for ordinal customs ignores it for v1 (radio rendering).
  // Reserved for a follow-up that adds the color-swatch input path.
  color?: string;
}

export interface CustomMetricDef {
  id: string;
  ownerId: string;
  name: string;
  metricType: CustomMetricType;
  primitive: CustomMetricPrimitive;

  // Numeric-only config. Required when primitive === "numeric"; for
  // ordinal customs, `goalRaw`/`avgDecimals` stay meaningful, and
  // `yTopRaw`/`yBottomRaw` are derived from levels at save-time so
  // the chart engine reads them like always. `unit` is meaningless
  // for non-numeric primitives.
  unit?: string;
  goalRaw?: number;
  yTopRaw?: number;
  yBottomRaw?: number;
  avgDecimals?: number;

  // Categorical config; required when primitive ∈ {"ordinal", "nominal"};
  // omitted for "numeric". Order is meaningful for ordinal (matches
  // ascending `value`); incidental for nominal.
  levels?: CustomMetricLevel[];

  inputType: CustomMetricInputType;
  referenceUrl: string;
  createdAt: number;
  updatedAt: number;
}
