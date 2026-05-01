import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import { migrateDocument } from "../migrations";
import { CURRENT_WELLNESS_ENTRY_VERSION } from "../migrations/wellnessEntry";
import { CURRENT_PERFORMANCE_ENTRY_VERSION } from "../migrations/performanceEntry";
import { daysAgoFromISO, isoAtDaysAgo } from "../utils/dates";
import { logError } from "../utils/logError";
import {
  emptyWellnessEntry,
  emptyPerformanceEntry,
  type DataLoadState,
  type PerformanceEntry,
  type WellnessEntry,
} from "../types/data";

export interface DataContextValue {
  wellness: DataLoadState<WellnessEntry>;
  performance: DataLoadState<PerformanceEntry>;
  // Per-date partial-merge writes. Caller passes only the fields to
  // update; the doc is identified by date string ("YYYY-MM-DD"). The
  // exposed wellness/performance values include an optimistic overlay
  // of the partial so all useData() consumers see the change
  // synchronously - the actual Firestore setDoc is debounced to
  // coalesce write-amp. The version field is stamped only on creation
  // or upgrade; see firestoreSet* below.
  setWellnessEntry: (
    date: string,
    partial: Partial<WellnessEntry>,
  ) => void;
  setPerformanceEntry: (
    date: string,
    partial: Partial<PerformanceEntry>,
  ) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

const DEBOUNCE_MS = 500;

// Largest window the chart UI can display ("All time" in TimeRangePicker
// is 365 days). Listeners filter at this floor so we don't pay reads on
// docs the UI cannot render. The floor advances at local midnight so the
// window stays current across multi-day sessions.
const LISTENER_WINDOW_DAYS = 365;

type PendingEntry<T> = { uid: string; partial: Partial<T> };
type PendingMap<T> = Record<string, PendingEntry<T>>;

// Partial-merge writes only stamp `version` when the server doc is
// either unknown to us (creation path) or known to be older than ours
// (upgrade path). This keeps a stale client - whose CURRENT_*_VERSION
// is behind the deployed code - from rolling the version field
// backward on every write, which would force every reader to re-run
// the migration chain on every keystroke. The "known server version"
// is sniffed off each onSnapshot doc (pre-migration) into the
// *ServerVersionsRef caches and read at flush time. Migrations remain
// required to be idempotent (see migrations/types.ts) - the cache
// just bounds how often we exercise that contract.
function firestoreSetWellnessEntry(
  uid: string,
  date: string,
  partial: Partial<WellnessEntry>,
  knownServerVersion: number | undefined,
): Promise<void> {
  const ref = doc(db, "users", uid, "wellnessEntries", date);
  const fields: Record<string, unknown> = { ...partial, date };
  if (
    knownServerVersion === undefined ||
    knownServerVersion < CURRENT_WELLNESS_ENTRY_VERSION
  ) {
    fields.version = CURRENT_WELLNESS_ENTRY_VERSION;
  }
  return setDoc(ref, fields, { merge: true });
}

function firestoreSetPerformanceEntry(
  uid: string,
  date: string,
  partial: Partial<PerformanceEntry>,
  knownServerVersion: number | undefined,
): Promise<void> {
  const ref = doc(db, "users", uid, "performanceEntries", date);
  const fields: Record<string, unknown> = { ...partial, date };
  if (
    knownServerVersion === undefined ||
    knownServerVersion < CURRENT_PERFORMANCE_ENTRY_VERSION
  ) {
    fields.version = CURRENT_PERFORMANCE_ENTRY_VERSION;
  }
  return setDoc(ref, fields, { merge: true });
}

// One-level-deep equality. Reconciliation only needs to compare
// primitives and flat objects (availability, performance.metrics).
// `{ x: undefined }` vs `{}` is intentionally NOT equal here; in
// practice the same-keys invariant always holds because availability
// is written as a full object and metrics maps preserve their keys
// across the wire.
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;
  const ak = Object.keys(a as Record<string, unknown>);
  const bk = Object.keys(b as Record<string, unknown>);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (
      !Object.is(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      )
    )
      return false;
  }
  return true;
}

function reduceWellnessPartial(
  partial: Partial<WellnessEntry>,
  server: WellnessEntry,
): Partial<WellnessEntry> | null {
  const remaining: Partial<WellnessEntry> = {};
  for (const key of Object.keys(partial) as (keyof WellnessEntry)[]) {
    if (!deepEqual(partial[key], server[key])) {
      (remaining as Record<string, unknown>)[key] = partial[
        key
      ] as unknown;
    }
  }
  return Object.keys(remaining).length > 0 ? remaining : null;
}

function reducePerformancePartial(
  partial: Partial<PerformanceEntry>,
  server: PerformanceEntry,
): Partial<PerformanceEntry> | null {
  const remaining: Partial<PerformanceEntry> = {};
  for (const key of Object.keys(partial) as (keyof PerformanceEntry)[]) {
    if (key === "metrics") {
      const pendingMetrics = partial.metrics ?? {};
      const serverMetrics = server.metrics ?? {};
      const remainingMetrics: Record<string, number | string> = {};
      for (const m of Object.keys(pendingMetrics)) {
        if (!deepEqual(pendingMetrics[m], serverMetrics[m])) {
          remainingMetrics[m] = pendingMetrics[m];
        }
      }
      if (Object.keys(remainingMetrics).length > 0) {
        remaining.metrics = remainingMetrics;
      }
    } else if (!deepEqual(partial[key], server[key])) {
      (remaining as Record<string, unknown>)[key] = partial[
        key
      ] as unknown;
    }
  }
  return Object.keys(remaining).length > 0 ? remaining : null;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [wellnessServer, setWellnessServer] = useState<
    DataLoadState<WellnessEntry>
  >({ status: "loading" });
  const [performanceServer, setPerformanceServer] = useState<
    DataLoadState<PerformanceEntry>
  >({ status: "loading" });

  const [wellnessPending, setWellnessPending] = useState<
    PendingMap<WellnessEntry>
  >({});
  const [performancePending, setPerformancePending] = useState<
    PendingMap<PerformanceEntry>
  >({});

  // The lower bound (inclusive) for date-string filtering on both
  // collection listeners. Computed once at session start; never advanced.
  // Over a long-running session the fetched window grows by N days past
  // 365, but the chart's display window is computed from "now" so any
  // older docs are filtered out by the UI. Trading a tiny extra-fetch
  // cost for a hard simplification: no midnight timer, no listener
  // re-issue, no race between flush and floor advance.
  const [floorISO] = useState(() =>
    isoAtDaysAgo(LISTENER_WINDOW_DAYS),
  );

  // Synchronous mirrors of the pending state so flush callbacks can
  // read current pending without a stale setState closure. Written
  // INLINE inside every setState updater that touches pending. The
  // ref write is idempotent (same `next` value as the return), so it
  // is safe under Strict Mode / concurrent re-invocation.
  const wellnessPendingRef = useRef<PendingMap<WellnessEntry>>({});
  const performancePendingRef = useRef<PendingMap<PerformanceEntry>>({});

  // Per-date debounce timers. One timer per date so navigating dates
  // mid-typing flushes each date independently.
  const wellnessTimersRef = useRef<Map<string, number>>(new Map());
  const performanceTimersRef = useRef<Map<string, number>>(new Map());

  // Pre-migration `version` per date, captured from each onSnapshot
  // tick. Read at flush time so we can skip the version stamp when the
  // server is already at or ahead of ours (see firestoreSet* above).
  // Cleared on user change.
  const wellnessServerVersionsRef = useRef<Map<string, number>>(new Map());
  const performanceServerVersionsRef = useRef<Map<string, number>>(
    new Map(),
  );

  const flushWellnessDate = useCallback((date: string) => {
    const entry = wellnessPendingRef.current[date];
    const t = wellnessTimersRef.current.get(date);
    if (t !== undefined) {
      window.clearTimeout(t);
      wellnessTimersRef.current.delete(date);
    }
    if (!entry || Object.keys(entry.partial).length === 0) return;
    const knownServerVersion = wellnessServerVersionsRef.current.get(date);
    // Pending is NOT dropped here. Reconciliation (driven by
    // onSnapshot) is the sole authority that removes pending entries
    // once the server confirms them. This preserves optimistic state
    // across the round-trip, and across transient setDoc failures.
    firestoreSetWellnessEntry(
      entry.uid,
      date,
      entry.partial,
      knownServerVersion,
    ).catch((err) => {
      logError(err, {
        stage: "dataContext.wellness.flush",
        uid: entry.uid,
        date,
      });
    });
  }, []);

  const flushPerformanceDate = useCallback((date: string) => {
    const entry = performancePendingRef.current[date];
    const t = performanceTimersRef.current.get(date);
    if (t !== undefined) {
      window.clearTimeout(t);
      performanceTimersRef.current.delete(date);
    }
    if (!entry || Object.keys(entry.partial).length === 0) return;
    const knownServerVersion =
      performanceServerVersionsRef.current.get(date);
    firestoreSetPerformanceEntry(
      entry.uid,
      date,
      entry.partial,
      knownServerVersion,
    ).catch((err) => {
      logError(err, {
        stage: "dataContext.performance.flush",
        uid: entry.uid,
        date,
      });
    });
  }, []);

  // Provider unmount: flush all pending dates synchronously. uid is
  // read from each pending entry, so this cleanup has no `user`
  // closure of its own. Declared FIRST so its cleanup fires before
  // the [user]-effect cleanups (React fires cleanups in declaration
  // order). After flushing, refs are cleared so the [user] cleanups
  // see nothing to discard.
  useEffect(() => {
    return () => {
      for (const date of Array.from(wellnessTimersRef.current.keys())) {
        flushWellnessDate(date);
      }
      for (const date of Array.from(performanceTimersRef.current.keys())) {
        flushPerformanceDate(date);
      }
      wellnessTimersRef.current.clear();
      performanceTimersRef.current.clear();
      wellnessPendingRef.current = {};
      performancePendingRef.current = {};
    };
  }, [flushWellnessDate, flushPerformanceDate]);

  // Clear the pre-migration version cache when the signed-in user
  // changes (the next user's docs are unrelated). Declared AFTER the
  // unmount-flush effect so its cleanup runs after unmount-flush -
  // unmount-flush still needs the cache to compute the version-stamp
  // decision for each in-flight write. Floor rotation does NOT clear
  // because the new listener may not redeliver every doc; clearing
  // would briefly defeat the downgrade guard.
  useEffect(() => {
    return () => {
      wellnessServerVersionsRef.current.clear();
      performanceServerVersionsRef.current.clear();
    };
  }, [user]);

  // Wellness collection subscription. Cleanup discards pending state
  // - sign-out / user-switch must NOT flush (prior session is gone,
  // writes would be rejected by rules; optimistic state is
  // intentionally lost). On provider unmount, the unmount-flush
  // effect declared above runs its cleanup FIRST under React's
  // declaration-order cleanup, so it flushes before this cleanup
  // clears - making unmount the only path that persists pending
  // writes. floorISO is captured once at mount and never changes, so
  // this effect re-runs only on user change.
  useEffect(() => {
    if (!user) {
      setWellnessServer({ status: "loading" });
      return;
    }
    setWellnessServer({ status: "loading" });
    const ref = collection(db, "users", user.uid, "wellnessEntries");
    const q = query(ref, where("date", ">=", floorISO));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const entries: WellnessEntry[] = [];
        snap.forEach((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          // Cache pre-migration version BEFORE attempting migration so
          // a stale client receiving a future-version doc still
          // records the server's version (and won't downgrade it on
          // its next write, even though it can't render the doc).
          const rawDate =
            typeof raw.date === "string" ? raw.date : null;
          const rawVersion =
            typeof raw.version === "number"
              ? (raw.version as number)
              : null;
          if (rawDate !== null && rawVersion !== null) {
            wellnessServerVersionsRef.current.set(rawDate, rawVersion);
          }
          try {
            const migrated = migrateDocument(
              "wellnessEntry",
              raw,
            ) as unknown as WellnessEntry;
            entries.push(migrated);
          } catch (err) {
            logError(err, {
              docPath: docSnap.ref.path,
              fromVersion: rawVersion ?? 1,
            });
          }
        });
        setWellnessServer({ status: "loaded", entries });
        // Field-level reconciliation against the snapshot. Build the
        // date->server map ONCE, outside the setState updater.
        const serverByDate = new Map<string, WellnessEntry>();
        for (const e of entries) serverByDate.set(e.date, e);
        setWellnessPending((prev) => {
          let changed = false;
          const next: PendingMap<WellnessEntry> = {};
          for (const [date, entry] of Object.entries(prev)) {
            const server = serverByDate.get(date);
            if (!server) {
              next[date] = entry;
              continue;
            }
            const reduced = reduceWellnessPartial(entry.partial, server);
            if (reduced === null) {
              changed = true;
              continue;
            }
            if (reduced !== entry.partial) {
              changed = true;
              next[date] = { uid: entry.uid, partial: reduced };
            } else {
              next[date] = entry;
            }
          }
          if (changed) wellnessPendingRef.current = next;
          return changed ? next : prev;
        });
      },
      (err) => {
        logError(err, {
          stage: "dataContext.wellness.onSnapshot",
          uid: user.uid,
        });
        setWellnessServer({ status: "loaded", entries: [] });
      },
    );
    return () => {
      unsubscribe();
      // Clear pending+timers on user change. On unmount this is a
      // no-op because the unmount effect (declared last) runs its
      // cleanup first, flushes, and leaves these empty.
      for (const t of wellnessTimersRef.current.values()) {
        window.clearTimeout(t);
      }
      wellnessTimersRef.current.clear();
      wellnessPendingRef.current = {};
      setWellnessPending({});
    };
  }, [user, floorISO]);

  // Performance collection subscription. Same shape as wellness.
  useEffect(() => {
    if (!user) {
      setPerformanceServer({ status: "loading" });
      return;
    }
    setPerformanceServer({ status: "loading" });
    const ref = collection(db, "users", user.uid, "performanceEntries");
    const q = query(ref, where("date", ">=", floorISO));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const entries: PerformanceEntry[] = [];
        snap.forEach((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          const rawDate =
            typeof raw.date === "string" ? raw.date : null;
          const rawVersion =
            typeof raw.version === "number"
              ? (raw.version as number)
              : null;
          if (rawDate !== null && rawVersion !== null) {
            performanceServerVersionsRef.current.set(
              rawDate,
              rawVersion,
            );
          }
          try {
            const migrated = migrateDocument(
              "performanceEntry",
              raw,
            ) as unknown as PerformanceEntry;
            entries.push(migrated);
          } catch (err) {
            logError(err, {
              docPath: docSnap.ref.path,
              fromVersion: rawVersion ?? 1,
            });
          }
        });
        setPerformanceServer({ status: "loaded", entries });
        const serverByDate = new Map<string, PerformanceEntry>();
        for (const e of entries) serverByDate.set(e.date, e);
        setPerformancePending((prev) => {
          let changed = false;
          const next: PendingMap<PerformanceEntry> = {};
          for (const [date, entry] of Object.entries(prev)) {
            const server = serverByDate.get(date);
            if (!server) {
              next[date] = entry;
              continue;
            }
            const reduced = reducePerformancePartial(
              entry.partial,
              server,
            );
            if (reduced === null) {
              changed = true;
              continue;
            }
            if (reduced !== entry.partial) {
              changed = true;
              next[date] = { uid: entry.uid, partial: reduced };
            } else {
              next[date] = entry;
            }
          }
          if (changed) performancePendingRef.current = next;
          return changed ? next : prev;
        });
      },
      (err) => {
        logError(err, {
          stage: "dataContext.performance.onSnapshot",
          uid: user.uid,
        });
        setPerformanceServer({ status: "loaded", entries: [] });
      },
    );
    return () => {
      unsubscribe();
      for (const t of performanceTimersRef.current.values()) {
        window.clearTimeout(t);
      }
      performanceTimersRef.current.clear();
      performancePendingRef.current = {};
      setPerformancePending({});
    };
  }, [user, floorISO]);

  const setWellnessEntry = useCallback(
    (date: string, partial: Partial<WellnessEntry>) => {
      if (!user) return;
      // Reject malformed, future, or out-of-window dates. The listener's
      // floorISO filter (see useEffect above) means a write below the
      // floor would round-trip into the optimistic overlay but never
      // come back via onSnapshot - reconciliation would never drop it.
      // daysAgoFromISO returns NaN for bad format and future dates.
      if (Number.isNaN(daysAgoFromISO(date)) || date < floorISO) {
        logError(new Error("setWellnessEntry: date out of window"), {
          stage: "dataContext.wellness.setEntry",
          uid: user.uid,
          date,
          floorISO,
        });
        return;
      }
      const uid = user.uid;
      setWellnessPending((prev) => {
        const existingPartial = prev[date]?.partial ?? {};
        const next: PendingMap<WellnessEntry> = {
          ...prev,
          [date]: {
            uid,
            partial: { ...existingPartial, ...partial },
          },
        };
        wellnessPendingRef.current = next;
        return next;
      });
      const existing = wellnessTimersRef.current.get(date);
      if (existing !== undefined) window.clearTimeout(existing);
      const t = window.setTimeout(
        () => flushWellnessDate(date),
        DEBOUNCE_MS,
      );
      wellnessTimersRef.current.set(date, t);
    },
    [user, floorISO, flushWellnessDate],
  );

  const setPerformanceEntry = useCallback(
    (date: string, partial: Partial<PerformanceEntry>) => {
      if (!user) return;
      // See setWellnessEntry for rationale.
      if (Number.isNaN(daysAgoFromISO(date)) || date < floorISO) {
        logError(new Error("setPerformanceEntry: date out of window"), {
          stage: "dataContext.performance.setEntry",
          uid: user.uid,
          date,
          floorISO,
        });
        return;
      }
      const uid = user.uid;
      setPerformancePending((prev) => {
        const existingPartial = prev[date]?.partial ?? {};
        const merged: Partial<PerformanceEntry> = {
          ...existingPartial,
          ...partial,
        };
        // Deep-merge metrics so accumulating writes across multiple
        // metric inputs preserves all fields. A naive shallow merge
        // would clobber prior pending metric keys with each new one.
        if (
          existingPartial.metrics !== undefined ||
          partial.metrics !== undefined
        ) {
          merged.metrics = {
            ...(existingPartial.metrics ?? {}),
            ...(partial.metrics ?? {}),
          };
        }
        const next: PendingMap<PerformanceEntry> = {
          ...prev,
          [date]: { uid, partial: merged },
        };
        performancePendingRef.current = next;
        return next;
      });
      const existing = performanceTimersRef.current.get(date);
      if (existing !== undefined) window.clearTimeout(existing);
      const t = window.setTimeout(
        () => flushPerformanceDate(date),
        DEBOUNCE_MS,
      );
      performanceTimersRef.current.set(date, t);
    },
    [user, floorISO, flushPerformanceDate],
  );

  const wellness = useMemo<DataLoadState<WellnessEntry>>(() => {
    const byDate = new Map<string, WellnessEntry>();
    if (wellnessServer.status === "loaded") {
      for (const e of wellnessServer.entries) byDate.set(e.date, e);
    }
    for (const [date, entry] of Object.entries(wellnessPending)) {
      const base = byDate.get(date) ?? emptyWellnessEntry(date);
      byDate.set(date, { ...base, ...entry.partial });
    }
    if (wellnessServer.status !== "loaded" && byDate.size === 0) {
      return wellnessServer;
    }
    return { status: "loaded", entries: Array.from(byDate.values()) };
  }, [wellnessServer, wellnessPending]);

  const performance = useMemo<DataLoadState<PerformanceEntry>>(() => {
    const byDate = new Map<string, PerformanceEntry>();
    if (performanceServer.status === "loaded") {
      for (const e of performanceServer.entries) byDate.set(e.date, e);
    }
    for (const [date, entry] of Object.entries(performancePending)) {
      const base = byDate.get(date) ?? emptyPerformanceEntry(date);
      // Deep-merge metrics: a naive {...base, ...partial} would
      // clobber base.metrics with the sparse partial.metrics, wiping
      // out established metrics for adjacent fields the user is not
      // currently typing on.
      byDate.set(date, {
        ...base,
        ...entry.partial,
        metrics: {
          ...(base.metrics ?? {}),
          ...(entry.partial.metrics ?? {}),
        },
      });
    }
    if (performanceServer.status !== "loaded" && byDate.size === 0) {
      return performanceServer;
    }
    return { status: "loaded", entries: Array.from(byDate.values()) };
  }, [performanceServer, performancePending]);

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
