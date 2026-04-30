import { describe, it, expect, beforeEach } from "vitest";
import { migrateDocument } from "./index";
import { resetRegistryForTests } from "./testing";
import { wellnessEntryFixtures } from "./wellnessEntry.fixtures";

// Deep-equality assertion: today there are no registered migrations, so
// the migrated doc must equal the input fixture exactly. The previous
// `migrated.version ?? CURRENT === CURRENT` shape was vacuous - the `??`
// fallback masked a missing version field, and no shape assertion caught
// data-loss bugs.
//
// **WHEN A v1 -> v2 MIGRATION LANDS**: this test will start failing for
// every fixture (because `migrated` no longer equals the input). At that
// point, refactor `wellnessEntry.fixtures.ts` to export both an `inputs`
// map and an `expected` map (the v_current shape), and update the
// assertion to `expect(migrated).toEqual(expected[key])`. Don't drop
// fields silently to "make the test pass" - if a field disappears in the
// migrated output and you can't explain why, the migration has a bug.
//
// Also: add the new (docType, fromVersion, sample) entry to the
// idempotency-fixture list in migrations/index.test.ts (see the
// "migration idempotency contract" describe block).
describe("wellnessEntry migrations", () => {
  beforeEach(() => {
    resetRegistryForTests();
  });

  it.each(Object.keys(wellnessEntryFixtures))(
    "fixture '%s' migrates without data loss",
    (key) => {
      const fixture =
        wellnessEntryFixtures[key as keyof typeof wellnessEntryFixtures];
      const migrated = migrateDocument(
        "wellnessEntry",
        fixture as unknown as Record<string, unknown>,
      );
      expect(migrated).toEqual(fixture);
    },
  );
});
