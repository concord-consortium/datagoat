import type { Profile } from "../types/profile";
import {
  getDocWithMigration,
  setDocWithVersion,
  updateDocFields,
  userDocRef,
} from "./firestore";

const PROFILE_VERSION = 1;

export async function getProfile(userId: string): Promise<Profile | null> {
  const ref = userDocRef(userId, "profile", "main");
  return getDocWithMigration<Profile>("profile", ref);
}

export async function saveProfile(
  userId: string,
  profile: Omit<Profile, "schemaVersion">,
): Promise<void> {
  const ref = userDocRef(userId, "profile", "main");
  await setDocWithVersion(ref, profile, PROFILE_VERSION);
}

export async function updateProfileField(
  userId: string,
  fields: Partial<Profile>,
): Promise<void> {
  const ref = userDocRef(userId, "profile", "main");
  await updateDocFields(ref, fields);
}
