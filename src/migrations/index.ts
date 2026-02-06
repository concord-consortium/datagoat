import type { MigrationFn, MigrationKey } from "./types";

const registry = new Map<MigrationKey, MigrationFn>();

export function registerMigration(
  docType: string,
  fromVersion: number,
  fn: MigrationFn,
) {
  registry.set(`${docType}:${fromVersion}`, fn);
}

export function migrateDocument(
  docType: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  let current = { ...data };
  let version = (current.schemaVersion as number) ?? 1;

  while (registry.has(`${docType}:${version}` as MigrationKey)) {
    const migrateFn = registry.get(`${docType}:${version}` as MigrationKey)!;
    current = migrateFn(current);
    version++;
    current.schemaVersion = version;
  }

  return current;
}

export { registry };
