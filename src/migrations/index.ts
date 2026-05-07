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
  // Clone once at entry so neither migrators nor the chain can reach
  // back into the caller's data through shared nested references. The
  // MigrationFn contract forbids mutation, but a buggy migrator that
  // returns a shallow copy keeps nested refs aliased to the input -
  // without this clone, a later step that touched a nested field would
  // corrupt the caller's Firestore snapshot data.
  let current = structuredClone(data);
  let version =
    typeof current.version === "number" ? (current.version as number) : 1;
  while (registry.has(`${docType}:${version}`)) {
    current = {
      ...registry.get(`${docType}:${version}`)!(current),
      version: version + 1,
    };
    version++;
  }
  return current;
}
