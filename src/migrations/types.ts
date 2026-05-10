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
// idempotency fixture list in migrations/index.test.ts. A coverage
// meta-test in that file fails the suite if a registered migration is
// missing its fixture.
//
// ---
//
// **Per-doc-type fixture tests** (`*.test.ts` next to each fixtures
// file) assert deep equality: today there are no registered migrations,
// so the migrated doc must equal the input fixture exactly. The
// previous `migrated.version ?? CURRENT === CURRENT` shape was vacuous
// - the `??` fallback masked a missing version field, and no shape
// assertion caught data-loss bugs.
//
// **WHEN A v1 -> v2 MIGRATION LANDS**: the affected doc-type's fixture
// test will start failing for every fixture (because `migrated` no
// longer equals the input). At that point, refactor that doc-type's
// `*.fixtures.ts` to export both an `inputs` map and an `expected` map
// (the v_current shape), and update the assertion to
// `expect(migrated).toEqual(expected[key])`. Don't drop fields silently
// to "make the test pass" - if a field disappears in the migrated
// output and you can't explain why, the migration has a bug.
//
// Also: add the new (docType, fromVersion, sample) entry to the
// idempotency-fixture list in migrations/index.test.ts (see the
// "migration idempotency contract" describe block).
export type MigrationFn = (
  data: Record<string, unknown>,
) => Record<string, unknown>;

export type DocType = "userProfile" | "healthEntry" | "competitionEntry";
