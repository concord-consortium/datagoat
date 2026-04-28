import { describe, it, expect, beforeEach } from "vitest";
import { migrateDocument, _resetRegistryForTests } from "./index";
import { CURRENT_USER_PROFILE_VERSION } from "./userProfile";
import { userProfileFixtures } from "./userProfile.fixtures";

describe("userProfile migrations", () => {
  beforeEach(() => {
    _resetRegistryForTests();
  });

  it.each(Object.keys(userProfileFixtures))(
    "fixture '%s' migrates to current version",
    (key) => {
      const fixture =
        userProfileFixtures[key as keyof typeof userProfileFixtures];
      const migrated = migrateDocument(
        "userProfile",
        fixture as unknown as Record<string, unknown>,
      );
      expect(migrated.version ?? CURRENT_USER_PROFILE_VERSION).toBe(
        CURRENT_USER_PROFILE_VERSION,
      );
    },
  );
});
