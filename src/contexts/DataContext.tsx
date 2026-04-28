import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import { docTypeFromPath, migrateDocument } from "../migrations";
import { CURRENT_WELLNESS_ENTRY_VERSION } from "../migrations/wellnessEntry";
import { CURRENT_PERFORMANCE_ENTRY_VERSION } from "../migrations/performanceEntry";
import { logError } from "../utils/logError";
import type {
  DataLoadState,
  PerformanceEntry,
  WellnessEntry,
} from "../types/data";

export interface DataContextValue {
  wellness: DataLoadState<WellnessEntry>;
  performance: DataLoadState<PerformanceEntry>;
  // Per-date partial-merge writes. Caller passes only the fields to
  // update; the doc is identified by date string ("YYYY-MM-DD") and
  // stamped with the current version.
  setWellnessEntry: (
    date: string,
    partial: Partial<WellnessEntry>,
  ) => Promise<void>;
  setPerformanceEntry: (
    date: string,
    partial: Partial<PerformanceEntry>,
  ) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [wellness, setWellness] = useState<DataLoadState<WellnessEntry>>({
    status: "loading",
  });
  const [performance, setPerformance] = useState<
    DataLoadState<PerformanceEntry>
  >({ status: "loading" });

  // Wellness collection subscription.
  useEffect(() => {
    if (!user) {
      setWellness({ status: "loading" });
      return;
    }
    setWellness({ status: "loading" });
    const ref = collection(db, "users", user.uid, "wellnessEntries");
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const entries: WellnessEntry[] = [];
        snap.forEach((docSnap) => {
          try {
            const migrated = migrateDocument(
              docTypeFromPath(docSnap.ref.path),
              docSnap.data() as Record<string, unknown>,
            ) as unknown as WellnessEntry;
            entries.push(migrated);
          } catch (err) {
            logError(err, {
              docPath: docSnap.ref.path,
              fromVersion:
                typeof docSnap.data()?.version === "number"
                  ? (docSnap.data()?.version as number)
                  : 1,
            });
            // Skip this doc - one bad entry must not take down the
            // whole collection.
          }
        });
        setWellness({ status: "loaded", entries });
      },
      (err) => {
        logError(err, {
          stage: "dataContext.wellness.onSnapshot",
          uid: user.uid,
        });
        // Treat as empty-loaded so the UI's empty-state takes over
        // rather than spinning forever.
        setWellness({ status: "loaded", entries: [] });
      },
    );
    return unsubscribe;
  }, [user]);

  // Performance collection subscription. Independent of wellness so
  // partial loads render fast.
  useEffect(() => {
    if (!user) {
      setPerformance({ status: "loading" });
      return;
    }
    setPerformance({ status: "loading" });
    const ref = collection(db, "users", user.uid, "performanceEntries");
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const entries: PerformanceEntry[] = [];
        snap.forEach((docSnap) => {
          try {
            const migrated = migrateDocument(
              docTypeFromPath(docSnap.ref.path),
              docSnap.data() as Record<string, unknown>,
            ) as unknown as PerformanceEntry;
            entries.push(migrated);
          } catch (err) {
            logError(err, {
              docPath: docSnap.ref.path,
              fromVersion:
                typeof docSnap.data()?.version === "number"
                  ? (docSnap.data()?.version as number)
                  : 1,
            });
          }
        });
        setPerformance({ status: "loaded", entries });
      },
      (err) => {
        logError(err, {
          stage: "dataContext.performance.onSnapshot",
          uid: user.uid,
        });
        setPerformance({ status: "loaded", entries: [] });
      },
    );
    return unsubscribe;
  }, [user]);

  const setWellnessEntry = useCallback(
    async (date: string, partial: Partial<WellnessEntry>) => {
      if (!user) throw new Error("setWellnessEntry called without auth user");
      const ref = doc(db, "users", user.uid, "wellnessEntries", date);
      await setDoc(
        ref,
        {
          ...partial,
          date,
          version: CURRENT_WELLNESS_ENTRY_VERSION,
        },
        { merge: true },
      );
    },
    [user],
  );

  const setPerformanceEntry = useCallback(
    async (date: string, partial: Partial<PerformanceEntry>) => {
      if (!user)
        throw new Error("setPerformanceEntry called without auth user");
      const ref = doc(db, "users", user.uid, "performanceEntries", date);
      await setDoc(
        ref,
        {
          ...partial,
          date,
          version: CURRENT_PERFORMANCE_ENTRY_VERSION,
        },
        { merge: true },
      );
    },
    [user],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      wellness,
      performance,
      setWellnessEntry,
      setPerformanceEntry,
    }),
    [wellness, performance, setWellnessEntry, setPerformanceEntry],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

export function useWellnessData(): DataLoadState<WellnessEntry> {
  return useData().wellness;
}

export function usePerformanceData(): DataLoadState<PerformanceEntry> {
  return useData().performance;
}
