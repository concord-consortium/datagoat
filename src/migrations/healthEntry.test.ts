import { describe, it, expect, beforeEach } from "vitest";
import { migrateDocument } from "./index";
import { resetRegistryForTests } from "./testing";
import { healthEntryFixtures } from "./healthEntry.fixtures";

// See migrations/types.ts for the rationale and v1 -> v2 refactor
// playbook ("Per-doc-type fixture tests").
describe("healthEntry migrations", () => {
  beforeEach(() => {
    resetRegistryForTests();
  });

  it.each(Object.keys(healthEntryFixtures))(
    "fixture '%s' migrates without data loss",
    (key) => {
      const fixture =
        healthEntryFixtures[key as keyof typeof healthEntryFixtures];
      const migrated = migrateDocument(
        "healthEntry",
        fixture as unknown as Record<string, unknown>,
      );
      expect(migrated).toEqual(fixture);
    },
  );
});
