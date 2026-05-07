import { describe, it, expect, beforeEach } from "vitest";
import { migrateDocument } from "./index";
import { resetRegistryForTests } from "./testing";
import { userProfileFixtures } from "./userProfile.fixtures";

// See migrations/types.ts for the rationale and v1 -> v2 refactor
// playbook ("Per-doc-type fixture tests").
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
