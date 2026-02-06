import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  type DocumentReference,
  type QueryConstraint,
  type DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";
import { migrateDocument } from "../migrations";

export async function getDocWithMigration<T>(
  docType: string,
  ref: DocumentReference,
): Promise<T | null> {
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return migrateDocument(docType, data) as T;
}

export async function setDocWithVersion<T extends DocumentData>(
  ref: DocumentReference,
  data: T,
  currentVersion: number,
): Promise<void> {
  await setDoc(ref, { ...data, schemaVersion: currentVersion });
}

export async function updateDocFields(
  ref: DocumentReference,
  fields: Record<string, unknown>,
): Promise<void> {
  await updateDoc(ref, fields);
}

export async function deleteDocument(ref: DocumentReference): Promise<void> {
  await deleteDoc(ref);
}

export async function queryDocsWithMigration<T>(
  docType: string,
  collectionPath: string,
  ...constraints: QueryConstraint[]
): Promise<T[]> {
  const ref = collection(db, collectionPath);
  const q = constraints.length > 0 ? query(ref, ...constraints) : ref;
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return { ...migrateDocument(docType, data), id: d.id } as T;
  });
}

export function docRef(...pathSegments: string[]): DocumentReference {
  return doc(db, pathSegments.join("/"));
}

export function userDocRef(
  userId: string,
  ...pathSegments: string[]
): DocumentReference {
  return doc(db, "users", userId, ...pathSegments);
}
