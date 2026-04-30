import type { DocType, MigrationFn } from "./types";
import { registry } from "./registry";

export function registerMigration(
  docType: DocType,
  fromVersion: number,
  fn: MigrationFn,
): void {
  registry.set(`${docType}:${fromVersion}`, fn);
}

export function migrateDocument(
  docType: DocType,
  data: Record<string, unknown>,
): Record<string, unknown> {
  let current = data;
  let version =
    typeof current.version === "number" ? (current.version as number) : 1;
  while (registry.has(`${docType}:${version}`)) {
    // Spread into a fresh object before stamping `version` so we never
    // mutate either the migrator's return value (in case it returned the
    // input by reference) or the caller's snapshot data.
    current = {
      ...registry.get(`${docType}:${version}`)!(current),
      version: version + 1,
    };
    version++;
  }
  return current;
}
