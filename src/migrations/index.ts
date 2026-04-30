import type { DocType, MigrationFn } from "./types";

const registry = new Map<string, MigrationFn>();

export function registerMigration(
  docType: DocType,
  fromVersion: number,
  fn: MigrationFn,
): void {
  registry.set(`${docType}:${fromVersion}`, fn);
}

// Test-only escape hatch (no production caller). Lets per-test setup register
// throwing migrations and the next test reset cleanly.
export function _resetRegistryForTests(): void {
  registry.clear();
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

export function docTypeFromPath(path: string): DocType {
  // Profile lives at users/{uid}/profile/main (single doc inside a "profile"
  // subcollection - Firestore requires alternating collection/doc segments,
  // so a bare users/{uid}/profile path can't address a doc). Detect either
  // the subcollection-substring form ("/profile/") or the legacy
  // ends-with form so existing fixtures keep working.
  if (path.includes("/profile/") || path.endsWith("/profile"))
    return "userProfile";
  if (path.includes("/wellnessEntries/")) return "wellnessEntry";
  if (path.includes("/performanceEntries/")) return "performanceEntry";
  throw new Error(`Unknown document path: ${path}`);
}
