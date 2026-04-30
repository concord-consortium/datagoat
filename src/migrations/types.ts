// A migration takes a v_n document and returns its v_(n+1) shape. Pure
// (no I/O, no side effects) and **idempotent**: applying the migration
// to its own output (after artificially resetting `version` back to n)
// must produce the same result as the first application.
//
// Why idempotent: DataContext stamps `version: CURRENT_*_VERSION` on
// every partial-merge write. A stale client tab still running the
// previous schema can write a downgraded version onto a server doc
// that already contains the newer-shape fields. The next reader will
// re-run the migration on a doc that already has v_(n+1) fields - if
// the migration isn't idempotent, that re-run corrupts the data.
//
// Whenever you register a new migration, also add an entry to the
// idempotency fixture list in migrations/index.test.ts.
export type MigrationFn = (
  data: Record<string, unknown>,
) => Record<string, unknown>;

export type DocType = "userProfile" | "wellnessEntry" | "performanceEntry";
