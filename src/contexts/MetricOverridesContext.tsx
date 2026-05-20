// MetricOverridesContext — per-user partial overrides of built-in
// metric goal/axis values.
//
// End-to-end save flow:
//   pencil on a tracked metric row
//   -> /add-metric/:type/:metricId
//   -> CustomMetricForm gateway detects a built-in id -> MetricOverrideForm
//   -> user edits Goal and / or y-axis fields
//   -> submit -> saveOverride() -> setDoc(merge: true) at
//        /users/{uid}/metricOverrides/{metricId}
//   -> Firestore snapshot fires -> setOverrides() rebuilds the overlay
//   -> setMetricOverrides(overlay) bumps _overlayVersion
//   -> useChartConfigSync() consumers re-render
//   -> getMetricChartConfig / lookupGoalLine pick up the new values
//   -> every chart that reads the metric reflects the override

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
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import type { MetricOverride } from "../types/metricOverrides";
import {
  setMetricOverrides,
  type MetricOverrideFields,
} from "../charts/metricChartConfig";

// Patch shape passed to saveOverride. For each axis field, three states
// are meaningful:
//   - number: set/replace the override for that field
//   - null: clear an existing override on that field (Firestore deleteField)
//   - undefined / omitted: leave the field untouched in the stored doc
// goalRaw uses the same set / omit shape (clearing is not currently
// supported). The form always sends goalRaw today, so the form-side
// invariant is "goal is required"; the type stays partial so a future
// caller can patch only axis fields without re-supplying goalRaw.
export type MetricOverridePatch = {
  goalRaw?: number;
  yTopRaw?: number | null;
  yBottomRaw?: number | null;
};

interface MetricOverridesValue {
  overrides: MetricOverride[];
  // True until the first snapshot lands (or there is no user / a test
  // seed short-circuits the subscription).
  loading: boolean;
  getOverride: (metricId: string) => MetricOverride | undefined;
  saveOverride: (metricId: string, patch: MetricOverridePatch) => Promise<void>;
}

const MetricOverridesContext = createContext<MetricOverridesValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  // Test seam — pre-seeds the list AND short-circuits the Firestore
  // subscription. Production callers omit this.
  initialOverrides?: MetricOverride[];
}

// Each user's overrides live in a subcollection of their user doc:
//   /users/{uid}/metricOverrides/{metricId}
// The doc id is the metric id, so (user, metric) uniqueness is enforced
// by Firestore itself - the legacy `${uid}_${metricId}` doc id had a
// collision surface when either component contained an underscore. The
// existing /users/{userId}/{document=**} security rule already restricts
// reads and writes to the path's owner, so no dedicated rule is needed.
const OVERRIDES_SUBCOLLECTION = "metricOverrides";

// Firestore Timestamp -> ms epoch.
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

// A finite number or undefined — never NaN. Guards both the Firestore
// reader and the overlay builder against a corrupt / partially-written
// doc producing NaN downstream in linearScale / SVG attributes.
function finiteOrUndefined(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

export function fromDoc(
  id: string,
  data: Record<string, unknown>,
): MetricOverride {
  return {
    id,
    ownerId: String(data.ownerId ?? ""),
    // The doc id IS the canonical metric id (overrides live at
    // /users/{uid}/metricOverrides/{metricId}). Use it directly so a
    // doc missing the redundant `metricId` field (e.g. written from
    // the Firestore Console) cannot silently key the overlay on "".
    metricId: id,
    goalRaw: finiteOrUndefined(data.goalRaw),
    yTopRaw: finiteOrUndefined(data.yTopRaw),
    yBottomRaw: finiteOrUndefined(data.yBottomRaw),
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

// Build the chart-config overlay: one partial entry per override,
// carrying only the fields that are finite numbers.
function buildOverlay(
  overrides: MetricOverride[],
): Record<string, MetricOverrideFields> {
  const overlay: Record<string, MetricOverrideFields> = {};
  for (const o of overrides) {
    const fields: MetricOverrideFields = {};
    if (o.goalRaw !== undefined) fields.goalRaw = o.goalRaw;
    if (o.yTopRaw !== undefined) fields.yTopRaw = o.yTopRaw;
    if (o.yBottomRaw !== undefined) fields.yBottomRaw = o.yBottomRaw;
    if (Object.keys(fields).length > 0) overlay[o.metricId] = fields;
  }
  return overlay;
}

export function MetricOverridesProvider({
  children,
  initialOverrides,
}: ProviderProps) {
  const { user } = useAuth();
  const [overrides, setOverrides] = useState<MetricOverride[]>(
    initialOverrides ?? [],
  );
  const [loading, setLoading] = useState<boolean>(
    initialOverrides === undefined,
  );

  useEffect(() => {
    if (initialOverrides !== undefined) {
      setLoading(false);
      return;
    }
    if (!user) {
      setOverrides([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Every doc in this subcollection is by construction owned by the
    // path uid, so no ownerId where-clause is needed.
    const overridesRef = collection(
      db,
      "users",
      user.uid,
      OVERRIDES_SUBCOLLECTION,
    );
    const unsubscribe = onSnapshot(
      overridesRef,
      (snap) => {
        const next: MetricOverride[] = [];
        snap.forEach((d) => {
          next.push(fromDoc(d.id, d.data({ serverTimestamps: "estimate" })));
        });
        setOverrides(next);
        setLoading(false);
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.error("MetricOverrides onSnapshot error", err);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [user, initialOverrides]);

  // Sync the runtime overlay so getMetricChartConfig / lookupGoalLine
  // see the user's overrides. Effect (post-commit) so render stays pure.
  const overlay = useMemo(() => buildOverlay(overrides), [overrides]);
  useEffect(() => {
    setMetricOverrides(overlay);
  }, [overlay]);

  const saveOverride = useCallback<MetricOverridesValue["saveOverride"]>(
    async (metricId, patch) => {
      if (!user) {
        throw new Error("saveOverride requires a signed-in user");
      }
      const ref = doc(
        db,
        "users",
        user.uid,
        OVERRIDES_SUBCOLLECTION,
        metricId,
      );
      const existing = overrides.find((o) => o.metricId === metricId);
      const payload: Record<string, unknown> = {
        ownerId: user.uid,
        metricId,
        updatedAt: serverTimestamp(),
      };
      // Set numeric fields only when finite. null means "clear" — convert
      // to deleteField() so merge:true actually removes it. undefined /
      // absent leaves the stored field untouched.
      if (Number.isFinite(patch.goalRaw)) payload.goalRaw = patch.goalRaw;
      if (patch.yTopRaw === null) {
        payload.yTopRaw = deleteField();
      } else if (Number.isFinite(patch.yTopRaw)) {
        payload.yTopRaw = patch.yTopRaw;
      }
      if (patch.yBottomRaw === null) {
        payload.yBottomRaw = deleteField();
      } else if (Number.isFinite(patch.yBottomRaw)) {
        payload.yBottomRaw = patch.yBottomRaw;
      }
      // Stamp createdAt only on first write so a later save doesn't
      // reset it (merge:true would otherwise overwrite it every time).
      if (!existing) payload.createdAt = serverTimestamp();
      await setDoc(ref, payload, { merge: true });
    },
    [user, overrides],
  );

  const value = useMemo<MetricOverridesValue>(
    () => ({
      overrides,
      loading,
      getOverride: (metricId) =>
        overrides.find((o) => o.metricId === metricId),
      saveOverride,
    }),
    [overrides, loading, saveOverride],
  );

  return (
    <MetricOverridesContext.Provider value={value}>
      {children}
    </MetricOverridesContext.Provider>
  );
}

// Empty fallback when no provider is mounted — keeps unrelated tests
// rendering without wrapping in MetricOverridesProvider.
const NOOP_VALUE: MetricOverridesValue = {
  overrides: [],
  loading: false,
  getOverride: () => undefined,
  saveOverride: async () => {
    throw new Error("saveOverride called without MetricOverridesProvider");
  },
};

export function useMetricOverrides(): MetricOverridesValue {
  const ctx = useContext(MetricOverridesContext);
  return ctx ?? NOOP_VALUE;
}
