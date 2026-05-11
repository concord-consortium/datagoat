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
  deleteField,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import { migrateDocument } from "../migrations";
import { CURRENT_HEALTH_ENTRY_VERSION } from "../migrations/healthEntry";
import { CURRENT_COMPETITION_ENTRY_VERSION } from "../migrations/competitionEntry";
import { daysAgoFromISO, isoAtDaysAgo } from "../utils/dates";
import { logError } from "../utils/logError";
import {
  emptyHealthEntry,
  emptyCompetitionEntry,
  type DataLoadState,
  type CompetitionEntry,
  type HealthEntry,
} from "../types/data";

export interface DataContextValue {
  health: DataLoadState<HealthEntry>;
  competition: DataLoadState<CompetitionEntry>;
  // Per-date partial-merge writes. Caller passes only the fields to
  // update; the doc is identified by date string ("YYYY-MM-DD"). The
  // exposed health/competition values include an optimistic overlay
  // of the partial so all useData() consumers see the change
  // synchronously - the actual Firestore setDoc is debounced to
  // coalesce write-amp. The version field is stamped only on creation
  // or upgrade; see firestoreSet* below.
  setHealthEntry: (
    date: string,
    partial: Partial<HealthEntry>,
  ) => void;
  setCompetitionEntry: (
    date: string,
    partial: Partial<CompetitionEntry>,
  ) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

const DEBOUNCE_MS = 500;

// Largest window the chart UI can display ("All time" in TimeRangePicker
// is 365 days). Listeners filter at this floor so we don't pay reads on
// docs the UI cannot render. Floor is computed once at session start;
// see floorISO state below for why it isn't advanced at midnight.
const LISTENER_WINDOW_DAYS = 365;

type PendingEntry<T> = { uid: string; partial: Partial<T> };
type PendingMap<T> = Record<string, PendingEntry<T>>;

// Walks an object one level deep, replacing top-level `undefined` values
// with deleteField() sentinels. Recurses one extra level into known
// nested map fields (availability sub-keys, customMetrics, metrics) since
// those also support per-key clearing under setDoc(merge:true). Other
// nested objects pass through as-is.
function withDeleteSentinels(
  payload: Record<string, unknown>,
  deepMapKeys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined) {
      out[k] = deleteField();
    } else if (
      deepMapKeys.includes(k) &&
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      const inner: Record<string, unknown> = {};
      for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) {
        inner[ik] = iv === undefined ? deleteField() : iv;
      }
      out[k] = inner;
    } else {
      out[k] = v;
    }
  }
  return out;
}

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
function firestoreSetHealthEntry(
  uid: string,
  date: string,
  partial: Partial<HealthEntry>,
  knownServerVersion: number | undefined,
): Promise<void> {
  const ref = doc(db, "users", uid, "healthEntries", date);
  const fields = withDeleteSentinels(
    { ...(partial as Record<string, unknown>), date },
    ["availability", "customMetrics"],
  );
  if (
    knownServerVersion === undefined ||
    knownServerVersion < CURRENT_HEALTH_ENTRY_VERSION
  ) {
    fields.version = CURRENT_HEALTH_ENTRY_VERSION;
  }
  // Availability sub-keys are optional in the type model - an absent
  // key means "not answered." Writing { availability: { practiceHeld: true } }
  // under merge:true correctly leaves the other sub-keys absent on disk,
  // and the readers (availabilityFilled etc.) treat absent keys as
  // unanswered.
  return setDoc(ref, fields, { merge: true });
}

function firestoreSetCompetitionEntry(
  uid: string,
  date: string,
  partial: Partial<CompetitionEntry>,
  knownServerVersion: number | undefined,
): Promise<void> {
  const ref = doc(db, "users", uid, "competitionEntries", date);
  const fields = withDeleteSentinels(
    { ...(partial as Record<string, unknown>), date },
    ["metrics"],
  );
  if (
    knownServerVersion === undefined ||
    knownServerVersion < CURRENT_COMPETITION_ENTRY_VERSION
  ) {
    fields.version = CURRENT_COMPETITION_ENTRY_VERSION;
  }
  return setDoc(ref, fields, { merge: true });
}

// One-level-deep equality. Reconciliation only needs to compare
// primitives and flat objects whose keys we already enumerate
// per-sub-key in the reducers (availability, competition.metrics).
// `{ x: undefined }` vs `{}` is intentionally NOT equal here.
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

function reduceHealthPartial(
  partial: Partial<HealthEntry>,
  server: HealthEntry,
): Partial<HealthEntry> | null {
  const remaining: Partial<HealthEntry> = {};
  for (const key of Object.keys(partial) as (keyof HealthEntry)[]) {
    if (key === "availability") {
      // Reduce per sub-key so a partial availability payload (e.g. just
      // { practiceHeld: true }) reconciles correctly against the full
      // server object - one-level deepEqual would short-circuit on the
      // mismatched key count and never drop the pending entry.
      const pendingAvail = partial.availability ?? {};
      const serverAvail = server.availability ?? {};
      const remainingAvail: Record<string, unknown> = {};
      for (const k of Object.keys(pendingAvail)) {
        const pk = pendingAvail[k as keyof typeof pendingAvail];
        const sk = serverAvail[k as keyof typeof serverAvail];
        if (!Object.is(pk, sk)) {
          remainingAvail[k] = pk;
        }
      }
      if (Object.keys(remainingAvail).length > 0) {
        remaining.availability =
          remainingAvail as HealthEntry["availability"];
      }
    } else if (key === "customMetrics") {
      // Same shape as the competition.metrics reducer: iterate pending
      // keys only and drop ones the server has confirmed. Without this
      // special case the one-level deepEqual would short-circuit on
      // the mismatched key count whenever the server entry already has
      // values for OTHER custom metrics, leaving the pending entry
      // stuck and re-flushing the same payload on every debounce.
      const pendingCustoms = partial.customMetrics ?? {};
      const serverCustoms = server.customMetrics ?? {};
      const remainingCustoms: Record<string, number | string | undefined> = {};
      for (const m of Object.keys(pendingCustoms)) {
        if (!deepEqual(pendingCustoms[m], serverCustoms[m])) {
          remainingCustoms[m] = pendingCustoms[m];
        }
      }
      if (Object.keys(remainingCustoms).length > 0) {
        remaining.customMetrics = remainingCustoms;
      }
    } else if (!deepEqual(partial[key], server[key])) {
      (remaining as Record<string, unknown>)[key] = partial[
        key
      ] as unknown;
    }
  }
  return Object.keys(remaining).length > 0 ? remaining : null;
}

function reduceCompetitionPartial(
  partial: Partial<CompetitionEntry>,
  server: CompetitionEntry,
): Partial<CompetitionEntry> | null {
  const remaining: Partial<CompetitionEntry> = {};
  for (const key of Object.keys(partial) as (keyof CompetitionEntry)[]) {
    if (key === "metrics") {
      const pendingMetrics = partial.metrics ?? {};
      const serverMetrics = server.metrics ?? {};
      const remainingMetrics: Record<string, number | string | undefined> = {};
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
  const [healthServer, setHealthServer] = useState<
    DataLoadState<HealthEntry>
  >({ status: "loading" });
  const [competitionServer, setCompetitionServer] = useState<
    DataLoadState<CompetitionEntry>
  >({ status: "loading" });

  const [healthPending, setHealthPending] = useState<
    PendingMap<HealthEntry>
  >({});
  const [competitionPending, setCompetitionPending] = useState<
    PendingMap<CompetitionEntry>
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
  const healthPendingRef = useRef<PendingMap<HealthEntry>>({});
  const competitionPendingRef = useRef<PendingMap<CompetitionEntry>>({});

  // Per-date debounce timers. One timer per date so navigating dates
  // mid-typing flushes each date independently.
  const healthTimersRef = useRef<Map<string, number>>(new Map());
  const competitionTimersRef = useRef<Map<string, number>>(new Map());

  // Pre-migration `version` per date, captured from each onSnapshot
  // tick. Read at flush time so we can skip the version stamp when the
  // server is already at or ahead of ours (see firestoreSet* above).
  // Cleared on user change.
  const healthServerVersionsRef = useRef<Map<string, number>>(new Map());
  const competitionServerVersionsRef = useRef<Map<string, number>>(
    new Map(),
  );

  const flushHealthDate = useCallback((date: string) => {
    const entry = healthPendingRef.current[date];
    const t = healthTimersRef.current.get(date);
    if (t !== undefined) {
      window.clearTimeout(t);
      healthTimersRef.current.delete(date);
    }
    if (!entry || Object.keys(entry.partial).length === 0) return;
    const knownServerVersion = healthServerVersionsRef.current.get(date);
    // Pending is NOT dropped here. Reconciliation (driven by
    // onSnapshot) is the sole authority that removes pending entries
    // once the server confirms them. This preserves optimistic state
    // across the round-trip, and across transient setDoc failures.
    firestoreSetHealthEntry(
      entry.uid,
      date,
      entry.partial,
      knownServerVersion,
    ).catch((err) => {
      logError(err, {
        stage: "dataContext.health.flush",
        uid: entry.uid,
        date,
      });
    });
  }, []);

  const flushCompetitionDate = useCallback((date: string) => {
    const entry = competitionPendingRef.current[date];
    const t = competitionTimersRef.current.get(date);
    if (t !== undefined) {
      window.clearTimeout(t);
      competitionTimersRef.current.delete(date);
    }
    if (!entry || Object.keys(entry.partial).length === 0) return;
    const knownServerVersion =
      competitionServerVersionsRef.current.get(date);
    firestoreSetCompetitionEntry(
      entry.uid,
      date,
      entry.partial,
      knownServerVersion,
    ).catch((err) => {
      logError(err, {
        stage: "dataContext.competition.flush",
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
      for (const date of Array.from(healthTimersRef.current.keys())) {
        flushHealthDate(date);
      }
      for (const date of Array.from(competitionTimersRef.current.keys())) {
        flushCompetitionDate(date);
      }
      healthTimersRef.current.clear();
      competitionTimersRef.current.clear();
      healthPendingRef.current = {};
      competitionPendingRef.current = {};
    };
  }, [flushHealthDate, flushCompetitionDate]);

  // Clear the pre-migration version cache when the signed-in user
  // changes (the next user's docs are unrelated). Declared AFTER the
  // unmount-flush effect so its cleanup runs after unmount-flush -
  // unmount-flush still needs the cache to compute the version-stamp
  // decision for each in-flight write. Keyed on user?.uid (not the
  // user object) so token-refresh / reload re-allocations of the same
  // uid don't wipe the cache and force re-stamping.
  useEffect(() => {
    return () => {
      healthServerVersionsRef.current.clear();
      competitionServerVersionsRef.current.clear();
    };
  }, [user?.uid]);

  // Health collection subscription. Cleanup discards pending state
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
      setHealthServer({ status: "loading" });
      return;
    }
    setHealthServer({ status: "loading" });
    const ref = collection(db, "users", user.uid, "healthEntries");
    const q = query(ref, where("date", ">=", floorISO));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        // Persistent-cache snapshots reflecting our own un-acked
        // writes (`hasPendingWrites === true`) are skipped: letting
        // them through would drop pending entries against the local
        // cache mirror of the queued write, so a later server-side
        // rejection would leave the optimistic state already cleared.
        // The next snapshot without this flag (server-acked) is what
        // drives reconciliation against authoritative state. We also
        // skip the server-state update for the same reason - the
        // optimistic memo's `byDate.size > 0` short-circuit covers
        // the rare offline-first-snapshot case where no server
        // snapshot has landed yet.
        if (snap.metadata?.hasPendingWrites) return;
        const entries: HealthEntry[] = [];
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
            healthServerVersionsRef.current.set(rawDate, rawVersion);
          }
          try {
            const migrated = migrateDocument(
              "healthEntry",
              raw,
            ) as unknown as HealthEntry;
            entries.push(migrated);
          } catch (err) {
            logError(err, {
              docPath: docSnap.ref.path,
              fromVersion: rawVersion ?? 1,
            });
          }
        });
        setHealthServer({ status: "loaded", entries });
        // Field-level reconciliation against the snapshot. Build the
        // date->server map ONCE, outside the setState updater.
        const serverByDate = new Map<string, HealthEntry>();
        for (const e of entries) serverByDate.set(e.date, e);
        setHealthPending((prev) => {
          let changed = false;
          const next: PendingMap<HealthEntry> = {};
          for (const [date, entry] of Object.entries(prev)) {
            const server = serverByDate.get(date);
            if (!server) {
              next[date] = entry;
              continue;
            }
            const reduced = reduceHealthPartial(entry.partial, server);
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
          if (changed) healthPendingRef.current = next;
          return changed ? next : prev;
        });
      },
      (err) => {
        logError(err, {
          stage: "dataContext.health.onSnapshot",
          uid: user.uid,
        });
        setHealthServer({ status: "loaded", entries: [] });
      },
    );
    return () => {
      unsubscribe();
      // Clear pending+timers on user change. On unmount this is a
      // no-op because the unmount effect (declared first) runs its
      // cleanup first, flushes, and leaves these empty.
      for (const t of healthTimersRef.current.values()) {
        window.clearTimeout(t);
      }
      healthTimersRef.current.clear();
      healthPendingRef.current = {};
      setHealthPending({});
    };
  }, [user, floorISO]);

  // Competition collection subscription. Same shape as health.
  useEffect(() => {
    if (!user) {
      setCompetitionServer({ status: "loading" });
      return;
    }
    setCompetitionServer({ status: "loading" });
    const ref = collection(db, "users", user.uid, "competitionEntries");
    const q = query(ref, where("date", ">=", floorISO));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        // See health onSnapshot for the hasPendingWrites rationale.
        if (snap.metadata?.hasPendingWrites) return;
        const entries: CompetitionEntry[] = [];
        snap.forEach((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          const rawDate =
            typeof raw.date === "string" ? raw.date : null;
          const rawVersion =
            typeof raw.version === "number"
              ? (raw.version as number)
              : null;
          if (rawDate !== null && rawVersion !== null) {
            competitionServerVersionsRef.current.set(
              rawDate,
              rawVersion,
            );
          }
          try {
            const migrated = migrateDocument(
              "competitionEntry",
              raw,
            ) as unknown as CompetitionEntry;
            entries.push(migrated);
          } catch (err) {
            logError(err, {
              docPath: docSnap.ref.path,
              fromVersion: rawVersion ?? 1,
            });
          }
        });
        setCompetitionServer({ status: "loaded", entries });
        const serverByDate = new Map<string, CompetitionEntry>();
        for (const e of entries) serverByDate.set(e.date, e);
        setCompetitionPending((prev) => {
          let changed = false;
          const next: PendingMap<CompetitionEntry> = {};
          for (const [date, entry] of Object.entries(prev)) {
            const server = serverByDate.get(date);
            if (!server) {
              next[date] = entry;
              continue;
            }
            const reduced = reduceCompetitionPartial(
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
          if (changed) competitionPendingRef.current = next;
          return changed ? next : prev;
        });
      },
      (err) => {
        logError(err, {
          stage: "dataContext.competition.onSnapshot",
          uid: user.uid,
        });
        setCompetitionServer({ status: "loaded", entries: [] });
      },
    );
    return () => {
      unsubscribe();
      for (const t of competitionTimersRef.current.values()) {
        window.clearTimeout(t);
      }
      competitionTimersRef.current.clear();
      competitionPendingRef.current = {};
      setCompetitionPending({});
    };
  }, [user, floorISO]);

  const setHealthEntry = useCallback(
    (date: string, partial: Partial<HealthEntry>) => {
      if (!user) return;
      // Reject malformed, future, or out-of-window dates. The listener's
      // floorISO filter (see useEffect above) means a write below the
      // floor would round-trip into the optimistic overlay but never
      // come back via onSnapshot - reconciliation would never drop it.
      // daysAgoFromISO returns NaN for bad format and future dates.
      if (Number.isNaN(daysAgoFromISO(date)) || date < floorISO) {
        logError(new Error("setHealthEntry: date out of window"), {
          stage: "dataContext.health.setEntry",
          uid: user.uid,
          date,
          floorISO,
        });
        return;
      }
      const uid = user.uid;
      setHealthPending((prev) => {
        const existingPartial = prev[date]?.partial ?? {};
        const merged: Partial<HealthEntry> = {
          ...existingPartial,
          ...partial,
        };
        // Deep-merge availability sub-keys so accumulating partial
        // availability writes within the debounce window preserve
        // earlier sub-keys instead of clobbering them. Mirrors the
        // metrics merge in setCompetitionEntry.
        if (
          existingPartial.availability !== undefined ||
          partial.availability !== undefined
        ) {
          merged.availability = {
            ...(existingPartial.availability ?? {}),
            ...(partial.availability ?? {}),
          } as HealthEntry["availability"];
        }
        // Deep-merge customMetrics for the same reason as availability —
        // accumulating writes across different custom-metric inputs
        // within the debounce window must not clobber earlier keys.
        if (
          existingPartial.customMetrics !== undefined ||
          partial.customMetrics !== undefined
        ) {
          merged.customMetrics = {
            ...(existingPartial.customMetrics ?? {}),
            ...(partial.customMetrics ?? {}),
          };
        }
        const next: PendingMap<HealthEntry> = {
          ...prev,
          [date]: { uid, partial: merged },
        };
        healthPendingRef.current = next;
        return next;
      });
      const existing = healthTimersRef.current.get(date);
      if (existing !== undefined) window.clearTimeout(existing);
      const t = window.setTimeout(
        () => flushHealthDate(date),
        DEBOUNCE_MS,
      );
      healthTimersRef.current.set(date, t);
    },
    [user, floorISO, flushHealthDate],
  );

  const setCompetitionEntry = useCallback(
    (date: string, partial: Partial<CompetitionEntry>) => {
      if (!user) return;
      // See setHealthEntry for rationale.
      if (Number.isNaN(daysAgoFromISO(date)) || date < floorISO) {
        logError(new Error("setCompetitionEntry: date out of window"), {
          stage: "dataContext.competition.setEntry",
          uid: user.uid,
          date,
          floorISO,
        });
        return;
      }
      const uid = user.uid;
      setCompetitionPending((prev) => {
        const existingPartial = prev[date]?.partial ?? {};
        const merged: Partial<CompetitionEntry> = {
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
        const next: PendingMap<CompetitionEntry> = {
          ...prev,
          [date]: { uid, partial: merged },
        };
        competitionPendingRef.current = next;
        return next;
      });
      const existing = competitionTimersRef.current.get(date);
      if (existing !== undefined) window.clearTimeout(existing);
      const t = window.setTimeout(
        () => flushCompetitionDate(date),
        DEBOUNCE_MS,
      );
      competitionTimersRef.current.set(date, t);
    },
    [user, floorISO, flushCompetitionDate],
  );

  const health = useMemo<DataLoadState<HealthEntry>>(() => {
    const byDate = new Map<string, HealthEntry>();
    if (healthServer.status === "loaded") {
      for (const e of healthServer.entries) byDate.set(e.date, e);
    }
    for (const [date, entry] of Object.entries(healthPending)) {
      const base = byDate.get(date) ?? emptyHealthEntry(date);
      // Deep-merge availability sub-keys: a naive {...base, ...partial}
      // would clobber base.availability with a sparse partial (e.g. a
      // pending { practiceHeld: true } would wipe gameHeld/gameParticipation
      // off the rendered entry). Same shape as the competition.metrics
      // merge below.
      byDate.set(date, {
        ...base,
        ...entry.partial,
        availability: {
          ...base.availability,
          ...(entry.partial.availability ?? {}),
        },
        customMetrics: {
          ...(base.customMetrics ?? {}),
          ...(entry.partial.customMetrics ?? {}),
        },
      });
    }
    if (healthServer.status !== "loaded" && byDate.size === 0) {
      return healthServer;
    }
    return { status: "loaded", entries: Array.from(byDate.values()) };
  }, [healthServer, healthPending]);

  const competition = useMemo<DataLoadState<CompetitionEntry>>(() => {
    const byDate = new Map<string, CompetitionEntry>();
    if (competitionServer.status === "loaded") {
      for (const e of competitionServer.entries) byDate.set(e.date, e);
    }
    for (const [date, entry] of Object.entries(competitionPending)) {
      const base = byDate.get(date) ?? emptyCompetitionEntry(date);
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
    if (competitionServer.status !== "loaded" && byDate.size === 0) {
      return competitionServer;
    }
    return { status: "loaded", entries: Array.from(byDate.values()) };
  }, [competitionServer, competitionPending]);

  const value = useMemo<DataContextValue>(
    () => ({
      health,
      competition,
      setHealthEntry,
      setCompetitionEntry,
    }),
    [health, competition, setHealthEntry, setCompetitionEntry],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

export function useHealthData(): DataLoadState<HealthEntry> {
  return useData().health;
}

export function useCompetitionData(): DataLoadState<CompetitionEntry> {
  return useData().competition;
}
