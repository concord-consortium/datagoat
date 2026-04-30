import { describe, it, expect, beforeEach } from "vitest";
import {
  migrateDocument,
  registerMigration,
  docTypeFromPath,
} from "./index";
import { resetRegistryForTests } from "./testing";
import type { DocType } from "./types";

describe("migrateDocument", () => {
  beforeEach(() => {
    resetRegistryForTests();
  });

  it("returns input unchanged when no migration is registered", () => {
    const doc = { version: 1, name: "test" };
    expect(migrateDocument("userProfile", doc)).toEqual(doc);
  });

  it("treats missing version as 1", () => {
    registerMigration("userProfile", 1, (d) => ({ ...d, addedInV2: true }));
    const result = migrateDocument("userProfile", { name: "test" });
    expect(result).toEqual({ name: "test", addedInV2: true, version: 2 });
  });

  it("walks the chain v1 -> v2 -> v3 in order", () => {
    registerMigration("userProfile", 1, (d) => ({ ...d, step1: true }));
    registerMigration("userProfile", 2, (d) => ({ ...d, step2: true }));
    const result = migrateDocument("userProfile", { version: 1 });
    expect(result.step1).toBe(true);
    expect(result.step2).toBe(true);
    expect(result.version).toBe(3);
  });

  it("stops when no migration is registered for the current version", () => {
    registerMigration("userProfile", 1, (d) => ({ ...d, version: 2 }));
    const result = migrateDocument("userProfile", { version: 1 });
    expect(result.version).toBe(2);
  });

  it("allows a registered migration to throw - caller catches", () => {
    registerMigration("userProfile", 1, () => {
      throw new Error("bad shape");
    });
    expect(() => migrateDocument("userProfile", { version: 1 })).toThrow(
      "bad shape",
    );
  });

  it("does not mutate the caller's input even when a migrator returns it by reference", () => {
    // Realistic worst case: a migrator returns its input unchanged
    // (e.g. a defensive "no-op-but-bump-version" pass). The migrate
    // loop must not stamp `version` onto the input object.
    registerMigration("userProfile", 1, (d) => d);
    const input = Object.freeze({ name: "test" });
    const result = migrateDocument("userProfile", input);
    expect(result).toEqual({ name: "test", version: 2 });
    expect(input).toEqual({ name: "test" });
    expect(result).not.toBe(input);
  });
});

// Migrations must be idempotent under version-downgrade. See
// migrations/types.ts and DataContext.tsx for the rationale (a stale
// client doing a partial-merge write can roll the server doc's version
// backward while leaving newer-shape fields in place; the next reader
// re-migrates the doc, and an idempotent migration produces the same
// result as the first run).
//
// Each fixture is [docType, fromVersion, sample v_fromVersion input].
// Add an entry whenever you call registerMigration() in a production
// module - this list is intentionally maintained by hand so the
// reviewer notices the contract.
const idempotencyFixtures: ReadonlyArray<
  readonly [DocType, number, Record<string, unknown>]
> = [
  // No migrations registered yet.
];

describe("migration idempotency contract", () => {
  if (idempotencyFixtures.length === 0) {
    it("(no migrations registered yet - add a fixture when one lands)", () => {
      expect(idempotencyFixtures.length).toBe(0);
    });
  }
  it.each(idempotencyFixtures as Array<[DocType, number, Record<string, unknown>]>)(
    "%s v%i migration is idempotent under version-downgrade",
    (docType, fromVersion, input) => {
      const once = migrateDocument(docType, input);
      const downgraded = { ...once, version: fromVersion };
      const twice = migrateDocument(docType, downgraded);
      expect(twice).toEqual(once);
    },
  );
});

describe("docTypeFromPath", () => {
  it("maps profile path", () => {
    expect(docTypeFromPath("users/abc/profile")).toBe("userProfile");
  });

  it("maps wellnessEntries path", () => {
    expect(docTypeFromPath("users/abc/wellnessEntries/2026-04-01")).toBe(
      "wellnessEntry",
    );
  });

  it("maps performanceEntries path", () => {
    expect(docTypeFromPath("users/abc/performanceEntries/2026-04-01")).toBe(
      "performanceEntry",
    );
  });

  it("throws on unknown path", () => {
    expect(() => docTypeFromPath("users/abc/foo")).toThrow();
  });
});
