import { describe, it, expect, beforeEach } from "vitest";
import { migrateDocument } from "./index";
import { resetRegistryForTests } from "./testing";
import { competitionEntryFixtures } from "./competitionEntry.fixtures";

// See migrations/types.ts for the rationale and v1 -> v2 refactor
// playbook ("Per-doc-type fixture tests").
describe("competitionEntry migrations", () => {
  beforeEach(() => {
    resetRegistryForTests();
  });

  it.each(Object.keys(competitionEntryFixtures))(
    "fixture '%s' migrates without data loss",
    (key) => {
      const fixture =
        competitionEntryFixtures[key as keyof typeof competitionEntryFixtures];
      const migrated = migrateDocument(
        "competitionEntry",
        fixture as unknown as Record<string, unknown>,
      );
      expect(migrated).toEqual(fixture);
    },
  );
});
