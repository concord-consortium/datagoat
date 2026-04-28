import {
  getDoc,
  setDoc,
  type DocumentReference,
} from "firebase/firestore";
import { docTypeFromPath, migrateDocument } from "../migrations";
import { logError } from "./logError";

// Migration error contract: if a registered migration throws, log via
// logError(err, { docPath, fromVersion }) and return null. UserContext
// treats null as { status: 'missing' } and DataContext skips the doc and
// continues with the rest of the collection - loud in logs, soft in UI,
// so a single bad doc can't take down a session.
export async function readDoc<T>(ref: DocumentReference): Promise<T | null> {
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const raw = snap.data() as Record<string, unknown>;
  try {
    const docType = docTypeFromPath(ref.path);
    return migrateDocument(docType, raw) as T;
  } catch (err) {
    const fromVersion =
      typeof raw.version === "number" ? (raw.version as number) : 1;
    logError(err, { docPath: ref.path, fromVersion });
    return null;
  }
}

export async function writeDoc<T extends Record<string, unknown>>(
  ref: DocumentReference,
  data: T,
  currentVersion: number,
): Promise<void> {
  await setDoc(ref, { ...data, version: currentVersion });
}
