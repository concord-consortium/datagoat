import { describe, it, expect, beforeEach } from "vitest";
import { migrateDocument } from "./index";
import { resetRegistryForTests } from "./testing";
import { userProfileFixtures } from "./userProfile.fixtures";

// Deep-equality assertion: today there are no registered migrations, so
// the migrated doc must equal the input fixture exactly. See
// wellnessEntry.test.ts for the full rationale and the refactor playbook
// when a v1 -> v2 migration lands (refactor fixtures to inputs+expected,
// add an entry to the idempotency-fixture list in index.test.ts).
describe("userProfile migrations", () => {
  beforeEach(() => {
    resetRegistryForTests();
  });

  it.each(Object.keys(userProfileFixtures))(
    "fixture '%s' migrates without data loss",
    (key) => {
      const fixture =
        userProfileFixtures[key as keyof typeof userProfileFixtures];
      const migrated = migrateDocument(
        "userProfile",
        fixture as unknown as Record<string, unknown>,
      );
      expect(migrated).toEqual(fixture);
    },
  );
});
