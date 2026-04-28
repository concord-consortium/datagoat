import { describe, it, expect, beforeEach } from "vitest";
import { migrateDocument, _resetRegistryForTests } from "./index";
import { CURRENT_WELLNESS_ENTRY_VERSION } from "./wellnessEntry";
import { wellnessEntryFixtures } from "./wellnessEntry.fixtures";

describe("wellnessEntry migrations", () => {
  beforeEach(() => {
    _resetRegistryForTests();
  });

  it.each(Object.keys(wellnessEntryFixtures))(
    "fixture '%s' migrates to current version",
    (key) => {
      const fixture =
        wellnessEntryFixtures[key as keyof typeof wellnessEntryFixtures];
      const migrated = migrateDocument(
        "wellnessEntry",
        fixture as unknown as Record<string, unknown>,
      );
      expect(migrated.version ?? CURRENT_WELLNESS_ENTRY_VERSION).toBe(
        CURRENT_WELLNESS_ENTRY_VERSION,
      );
    },
  );
});
