export type MigrationFn = (
  data: Record<string, unknown>,
) => Record<string, unknown>;

export type DocType = "userProfile" | "wellnessEntry" | "performanceEntry";
