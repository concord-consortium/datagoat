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
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import type {
  CustomMetricDef,
  CustomMetricLevel,
  CustomMetricPrimitive,
} from "../types/customMetrics";
import { mintCustomMetricId } from "../utils/customMetricId";
import {
  customDefToChartConfig,
  setCustomChartConfigs,
  type MetricChartConfig,
} from "../charts/metricChartConfig";

interface CustomMetricsValue {
  metrics: CustomMetricDef[];
  // True until either the first Firestore snapshot has been received,
  // initialMetrics was supplied (test seam), or there is no signed-in
  // user. Consumers can use it to gate "metric not found" decisions on
  // the snapshot having actually arrived — e.g., the edit form should
  // not Navigate away until it knows whether the metricId resolves.
  loading: boolean;
  addMetric: (
    input: Omit<CustomMetricDef, "id" | "ownerId" | "createdAt" | "updatedAt">,
  ) => Promise<CustomMetricDef>;
  // `createdAt` / `updatedAt` are provider-managed (server timestamps
  // on write, Firestore Timestamp on read). They're omitted from the
  // patch shape so a future caller can't accidentally overwrite them
  // and destabilize ordering. The provider stamps `updatedAt` itself.
  updateMetric: (
    id: string,
    patch: Partial<
      Omit<CustomMetricDef, "id" | "ownerId" | "createdAt" | "updatedAt">
    >,
  ) => Promise<void>;
  deleteMetric: (id: string) => Promise<void>;
  getMetric: (id: string) => CustomMetricDef | undefined;
}

const CustomMetricsContext = createContext<CustomMetricsValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  // Test seam — pre-seeds the in-memory list AND short-circuits the
  // Firestore subscription. Production callers omit this.
  initialMetrics?: CustomMetricDef[];
}

const COLLECTION = "metricDefinitions";

// Firestore Timestamp -> ms epoch (matches the in-memory Date.now() shape).
function tsToMillis(ts: unknown): number {
  if (
    ts &&
    typeof ts === "object" &&
    typeof (ts as Timestamp).toMillis === "function"
  ) {
    return (ts as Timestamp).toMillis();
  }
  return 0;
}

function readPrimitive(raw: unknown): CustomMetricPrimitive {
  if (raw === "numeric" || raw === "ordinal" || raw === "nominal") return raw;
  // Per spec: DB is cleared before demo so primitive is always written
  // by the form. A missing/invalid value indicates a corrupt doc or a
  // schema-drift we don't yet handle - fail loud rather than silently
  // coerce.
  throw new Error(`CustomMetricDef: invalid primitive value '${String(raw)}'`);
}

function readLevels(raw: unknown): CustomMetricLevel[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error("CustomMetricDef: levels must be an array");
  }
  return raw.map((r, i) => {
    if (typeof r !== "object" || r === null) {
      throw new Error(`CustomMetricDef: level ${i} is not an object`);
    }
    const row = r as Record<string, unknown>;
    if (typeof row.label !== "string") {
      throw new Error(`CustomMetricDef: level ${i} missing label`);
    }
    const level: CustomMetricLevel = { label: row.label };
    if (row.value !== undefined) {
      if (typeof row.value !== "number" || !Number.isFinite(row.value)) {
        throw new Error(`CustomMetricDef: level ${i} value not finite`);
      }
      level.value = row.value;
    }
    if (row.color !== undefined) {
      if (typeof row.color !== "string") {
        throw new Error(`CustomMetricDef: level ${i} color not string`);
      }
      level.color = row.color;
    }
    return level;
  });
}

export function fromDoc(id: string, data: Record<string, unknown>): CustomMetricDef {
  return {
    id,
    ownerId: String(data.ownerId ?? ""),
    name: String(data.name ?? ""),
    // Preserve the three-way CustomMetricType (health / performance /
    // competition) introduced for DGT-51. Anything outside the union
    // coerces to "health" as the safest default - it puts unknown
    // metric types in the daily-log section instead of orphaning them.
    metricType:
      data.metricType === "competition"
        ? "competition"
        : data.metricType === "performance"
          ? "performance"
          : "health",
    primitive: readPrimitive(data.primitive),
    inputType: data.inputType === "radio" ? "radio" : "numeric",
    // `== null` (loose) so a Firestore `null` is treated the same as
    // an absent field. Strict `=== undefined` here would let
    // `String(null)` surface as the literal `"null"` in the UI and
    // `Number(null) === 0` mask a stale-zero in numeric fields.
    unit: data.unit == null ? undefined : String(data.unit),
    goalRaw: data.goalRaw == null ? undefined : Number(data.goalRaw),
    yTopRaw: data.yTopRaw == null ? undefined : Number(data.yTopRaw),
    yBottomRaw: data.yBottomRaw == null ? undefined : Number(data.yBottomRaw),
    avgDecimals: data.avgDecimals == null ? undefined : Number(data.avgDecimals),
    levels: readLevels(data.levels),
    referenceUrl: String(data.referenceUrl ?? ""),
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

export function CustomMetricsProvider({ children, initialMetrics }: ProviderProps) {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<CustomMetricDef[]>(initialMetrics ?? []);
  // initialMetrics short-circuits the subscription, so loading starts
  // false in tests. In production, we start in loading state until the
  // first onSnapshot emission lands (or until we know there's no user).
  const [loading, setLoading] = useState<boolean>(initialMetrics === undefined);

  // Subscribe to the current user's metric definitions. Skipped when
  // initialMetrics is provided (test seam) or when no user is signed in.
  // Use `!== undefined` so an empty-array seed (`[]`) still short-circuits
  // the subscription instead of falling through as falsy.
  useEffect(() => {
    if (initialMetrics !== undefined) {
      setLoading(false);
      return;
    }
    if (!user) {
      setMetrics([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, COLLECTION),
      where("ownerId", "==", user.uid),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next: CustomMetricDef[] = [];
        snap.forEach((d) => {
          // serverTimestamps: "estimate" fills in a local-clock estimate
          // for unresolved server timestamps. Without it, a freshly
          // created doc surfaces createdAt=null on the first local
          // snapshot, which fromDoc maps to 0 and would briefly sort the
          // new metric to the top of the list before flicking back into
          // place once the server value lands.
          next.push(fromDoc(d.id, d.data({ serverTimestamps: "estimate" })));
        });
        next.sort((a, b) => a.createdAt - b.createdAt);
        setMetrics(next);
        setLoading(false);
      },
      (err) => {
        // Surface in console; the demo can keep running with whatever
        // local state we already have. Clear the loading flag so the
        // form's edit-route gate can fall through to its
        // "not-found → Navigate" branch instead of spinning forever.
        // eslint-disable-next-line no-console
        console.error("CustomMetrics onSnapshot error", err);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [user, initialMetrics]);

  // Sync runtime overlay so getMetricChartConfig sees the user's custom
  // axis range, goal, formatter, and demo-mode random generator. Runs in
  // an effect (post-commit) so renders stay pure. setCustomChartConfigs
  // notifies subscribers (components that called useChartConfigSync), so
  // any component reading getMetricChartConfig in render re-renders with
  // the fresh overlay — not just consumers of this provider's context.
  const overlay = useMemo<Record<string, MetricChartConfig>>(() => {
    const next: Record<string, MetricChartConfig> = {};
    for (const def of metrics) {
      next[def.id] = customDefToChartConfig(def);
    }
    return next;
  }, [metrics]);
  useEffect(() => {
    setCustomChartConfigs(overlay);
  }, [overlay]);

  const addMetric = useCallback<CustomMetricsValue["addMetric"]>(
    async (input) => {
      if (!user) {
        throw new Error("addMetric requires a signed-in user");
      }
      let id = mintCustomMetricId();
      let retries = 0;
      while (metrics.some((m) => m.id === id)) {
        id = mintCustomMetricId();
        retries += 1;
        if (retries > 5) {
          throw new Error(
            "Could not mint a unique custom-metric id after 5 attempts",
          );
        }
      }
      const ref = doc(db, COLLECTION, id);
      const now = Date.now();
      const def: CustomMetricDef = {
        ...input,
        id,
        ownerId: user.uid,
        createdAt: now,
        updatedAt: now,
      };
      // Persist with server timestamps; the snapshot listener will
      // reconcile with the actual Timestamp values shortly.
      const levelsForWrite = def.levels?.map((l) => {
        const out: Record<string, unknown> = { label: l.label };
        if (l.value !== undefined) out.value = l.value;
        if (l.color !== undefined) out.color = l.color;
        return out;
      });
      const writePayload: Record<string, unknown> = {
        ownerId: user.uid,
        name: def.name,
        metricType: def.metricType,
        primitive: def.primitive,
        inputType: def.inputType,
        referenceUrl: def.referenceUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (def.unit !== undefined) writePayload.unit = def.unit;
      if (def.goalRaw !== undefined) writePayload.goalRaw = def.goalRaw;
      if (def.yTopRaw !== undefined) writePayload.yTopRaw = def.yTopRaw;
      if (def.yBottomRaw !== undefined) writePayload.yBottomRaw = def.yBottomRaw;
      if (def.avgDecimals !== undefined) writePayload.avgDecimals = def.avgDecimals;
      if (levelsForWrite !== undefined) writePayload.levels = levelsForWrite;
      await setDoc(ref, writePayload);
      return def;
    },
    [user, metrics],
  );

  const updateMetric = useCallback<CustomMetricsValue["updateMetric"]>(
    async (id, patch) => {
      if (!user) {
        throw new Error("updateMetric requires a signed-in user");
      }
      const ref = doc(db, COLLECTION, id);
      // Strip undefined values so we never write undefined into
      // Firestore. Also strip createdAt / updatedAt — the type system
      // already rules them out of the patch shape, but a TS-bypassed
      // caller could still pass them and silently overwrite the
      // provider-managed timestamps.
      //
      // TODO (DGT-50 follow-up): primitive changes (numeric -> ordinal
      // / nominal) leave stale numeric-only fields (`unit`, `goalRaw`,
      // `yTopRaw`, `yBottomRaw`) in Firestore because the form's
      // payload omits them and this strip-undefined drops them from
      // the write. Either thread `deleteField()` through here or have
      // the form pass explicit clearing values when primitive changes.
      // Demo scope is fresh-create, so deferred.
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (k === "createdAt" || k === "updatedAt") continue;
        if (v !== undefined) cleaned[k] = v;
      }
      cleaned.updatedAt = serverTimestamp();
      await updateDoc(ref, cleaned);
    },
    [user],
  );

  const deleteMetric = useCallback<CustomMetricsValue["deleteMetric"]>(
    async (id) => {
      if (!user) {
        throw new Error("deleteMetric requires a signed-in user");
      }
      await deleteDoc(doc(db, COLLECTION, id));
    },
    [user],
  );

  const value = useMemo<CustomMetricsValue>(
    () => ({
      metrics,
      loading,
      addMetric,
      updateMetric,
      deleteMetric,
      getMetric: (id) => metrics.find((m) => m.id === id),
    }),
    [metrics, loading, addMetric, updateMetric, deleteMetric],
  );

  return (
    <CustomMetricsContext.Provider value={value}>
      {children}
    </CustomMetricsContext.Provider>
  );
}

// Empty fallback returned when no provider is mounted. Lets existing
// tests for unrelated components keep rendering without wrapping in
// CustomMetricsProvider, while the production App.tsx always supplies
// the real provider.
const NOOP_VALUE: CustomMetricsValue = {
  metrics: [],
  // Without a provider there is nothing to load — match what an
  // unauthenticated production tree would settle to so consumers gating
  // on `loading` don't spin forever.
  loading: false,
  addMetric: async () => {
    throw new Error("addMetric called without CustomMetricsProvider");
  },
  updateMetric: async () => {
    throw new Error("updateMetric called without CustomMetricsProvider");
  },
  deleteMetric: async () => {
    throw new Error("deleteMetric called without CustomMetricsProvider");
  },
  getMetric: () => undefined,
};

export function useCustomMetrics(): CustomMetricsValue {
  const ctx = useContext(CustomMetricsContext);
  return ctx ?? NOOP_VALUE;
}
