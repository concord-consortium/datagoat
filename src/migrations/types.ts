export type MigrationFn = (
  data: Record<string, unknown>,
) => Record<string, unknown>;

export type MigrationKey = `${string}:${number}`;

export interface VersionedDocument {
  schemaVersion: number;
  [key: string]: unknown;
}
