import { describe, it, expect, beforeEach } from "vitest";
import { migrateDocument } from "./index";
import { resetRegistryForTests } from "./testing";
import { wellnessEntryFixtures } from "./wellnessEntry.fixtures";

// See migrations/types.ts for the rationale and v1 -> v2 refactor
// playbook ("Per-doc-type fixture tests").
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
