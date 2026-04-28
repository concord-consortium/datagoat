import { describe, it, expect, beforeEach } from "vitest";
import { migrateDocument, _resetRegistryForTests } from "./index";
import { CURRENT_PERFORMANCE_ENTRY_VERSION } from "./performanceEntry";
import { performanceEntryFixtures } from "./performanceEntry.fixtures";

describe("performanceEntry migrations", () => {
  beforeEach(() => {
    _resetRegistryForTests();
  });

  it.each(Object.keys(performanceEntryFixtures))(
    "fixture '%s' migrates to current version",
    (key) => {
      const fixture =
        performanceEntryFixtures[key as keyof typeof performanceEntryFixtures];
      const migrated = migrateDocument(
        "performanceEntry",
        fixture as unknown as Record<string, unknown>,
      );
      expect(migrated.version ?? CURRENT_PERFORMANCE_ENTRY_VERSION).toBe(
        CURRENT_PERFORMANCE_ENTRY_VERSION,
      );
    },
  );
});
