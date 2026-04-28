import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocumentReference } from "firebase/firestore";

vi.mock("firebase/firestore", () => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock("./logError", () => ({
  logError: vi.fn(),
}));

import { getDoc, setDoc } from "firebase/firestore";
import { logError } from "./logError";
import { readDoc, writeDoc } from "./firestoreDocs";
import {
  registerMigration,
  _resetRegistryForTests,
} from "../migrations";

function makeRef(path: string): DocumentReference {
  return { path } as unknown as DocumentReference;
}

describe("readDoc / writeDoc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRegistryForTests();
  });

  it("returns null when the doc does not exist", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    } as never);
    const ref = makeRef("users/abc/profile");
    const result = await readDoc<unknown>(ref);
    expect(result).toBeNull();
  });

  it("happy path: migrates and returns the document", async () => {
    registerMigration("userProfile", 1, (d) => ({
      ...d,
      migrated: true,
    }));
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ version: 1, name: "T" }),
    } as never);
    const ref = makeRef("users/abc/profile");
    const result = await readDoc<Record<string, unknown>>(ref);
    expect(result).not.toBeNull();
    expect(result!.migrated).toBe(true);
    expect(result!.version).toBe(2);
  });

  it("migration error contract: returns null and calls logError", async () => {
    registerMigration("userProfile", 1, () => {
      throw new Error("bad shape");
    });
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ version: 1, name: "T" }),
    } as never);
    const ref = makeRef("users/abc/profile");
    const result = await readDoc<unknown>(ref);
    expect(result).toBeNull();
    expect(logError).toHaveBeenCalledWith(
      expect.any(Error),
      { docPath: "users/abc/profile", fromVersion: 1 },
    );
  });

  it("writeDoc stamps the document with the current version", async () => {
    vi.mocked(setDoc).mockResolvedValue(undefined);
    const ref = makeRef("users/abc/profile");
    await writeDoc(ref, { name: "T" }, 3);
    expect(setDoc).toHaveBeenCalledWith(ref, { name: "T", version: 3 });
  });
});
