import { describe, it, expect, beforeEach } from "vitest";
import { migrateDocument } from "./index";
import { resetRegistryForTests } from "./testing";
import { performanceEntryFixtures } from "./performanceEntry.fixtures";

// See migrations/types.ts for the rationale and v1 -> v2 refactor
// playbook ("Per-doc-type fixture tests").
describe("performanceEntry migrations", () => {
  beforeEach(() => {
    resetRegistryForTests();
  });

  it.each(Object.keys(performanceEntryFixtures))(
    "fixture '%s' migrates without data loss",
    (key) => {
      const fixture =
        performanceEntryFixtures[key as keyof typeof performanceEntryFixtures];
      const migrated = migrateDocument(
        "performanceEntry",
        fixture as unknown as Record<string, unknown>,
      );
      expect(migrated).toEqual(fixture);
    },
  );
});
