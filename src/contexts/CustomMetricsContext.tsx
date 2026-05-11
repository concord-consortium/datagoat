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
import type { CustomMetricDef } from "../types/customMetrics";
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

function fromDoc(id: string, data: Record<string, unknown>): CustomMetricDef {
  return {
    id,
    ownerId: String(data.ownerId ?? ""),
    name: String(data.name ?? ""),
    metricType: data.metricType === "competition" ? "competition" : "health",
    inputType: data.inputType === "radio" ? "radio" : "numeric",
    unit: String(data.unit ?? ""),
    goalRaw: Number(data.goalRaw ?? 0),
    yTopRaw: Number(data.yTopRaw ?? 10),
    yBottomRaw: Number(data.yBottomRaw ?? 0),
    avgDecimals: Number(data.avgDecimals ?? 1),
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
      await setDoc(ref, {
        ownerId: user.uid,
        name: def.name,
        metricType: def.metricType,
        inputType: def.inputType,
        unit: def.unit,
        goalRaw: def.goalRaw,
        yTopRaw: def.yTopRaw,
        yBottomRaw: def.yBottomRaw,
        avgDecimals: def.avgDecimals,
        referenceUrl: def.referenceUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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
