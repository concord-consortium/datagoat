import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CustomMetricDef } from "../types/customMetrics";
import { mintCustomMetricId } from "../utils/customMetricId";
import {
  customDefToChartConfig,
  setCustomChartConfigs,
  type MetricChartConfig,
} from "../charts/metricChartConfig";

interface CustomMetricsValue {
  metrics: CustomMetricDef[];
  addMetric: (
    input: Omit<CustomMetricDef, "id" | "createdAt" | "updatedAt">,
  ) => CustomMetricDef;
  updateMetric: (id: string, patch: Partial<Omit<CustomMetricDef, "id">>) => void;
  deleteMetric: (id: string) => void;
  getMetric: (id: string) => CustomMetricDef | undefined;
}

const CustomMetricsContext = createContext<CustomMetricsValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  // Test seam — pre-seeds the in-memory list. Production callers omit this.
  initialMetrics?: CustomMetricDef[];
}

export function CustomMetricsProvider({ children, initialMetrics }: ProviderProps) {
  const [metrics, setMetrics] = useState<CustomMetricDef[]>(initialMetrics ?? []);

  // Sync a runtime overlay so getMetricChartConfig (used throughout
  // the chart pipeline as a pure function) sees the user's custom
  // axis range, goal, formatter, and demo-mode random generator.
  // Runs during render — not in useEffect — so consuming children
  // (rendered after the provider in React's top-down pass) see the
  // updated overlay on the same render that introduces a new metric.
  // setCustomChartConfigs is idempotent and cheap.
  const overlay = useMemo<Record<string, MetricChartConfig>>(() => {
    const next: Record<string, MetricChartConfig> = {};
    for (const def of metrics) {
      next[def.id] = customDefToChartConfig(def);
    }
    return next;
  }, [metrics]);
  setCustomChartConfigs(overlay);

  const addMetric = useCallback<CustomMetricsValue["addMetric"]>((input) => {
    const now = Date.now();
    const def: CustomMetricDef = {
      ...input,
      id: mintCustomMetricId(),
      createdAt: now,
      updatedAt: now,
    };
    setMetrics((prev) => [...prev, def]);
    return def;
  }, []);

  const updateMetric = useCallback<CustomMetricsValue["updateMetric"]>(
    (id, patch) => {
      const now = Date.now();
      setMetrics((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: now } : m)),
      );
    },
    [],
  );

  const deleteMetric = useCallback<CustomMetricsValue["deleteMetric"]>((id) => {
    setMetrics((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const value = useMemo<CustomMetricsValue>(
    () => ({
      metrics,
      addMetric,
      updateMetric,
      deleteMetric,
      getMetric: (id) => metrics.find((m) => m.id === id),
    }),
    [metrics, addMetric, updateMetric, deleteMetric],
  );

  return (
    <CustomMetricsContext.Provider value={value}>
      {children}
    </CustomMetricsContext.Provider>
  );
}

// Empty fallback returned when no provider is mounted. Lets existing
// tests for unrelated components (Dashboard, PerformanceLog) keep
// rendering without wrapping in CustomMetricsProvider, while the
// production App.tsx always supplies the real provider.
const NOOP_VALUE: CustomMetricsValue = {
  metrics: [],
  addMetric: () => {
    throw new Error("addMetric called without CustomMetricsProvider");
  },
  updateMetric: () => {
    throw new Error("updateMetric called without CustomMetricsProvider");
  },
  deleteMetric: () => {
    throw new Error("deleteMetric called without CustomMetricsProvider");
  },
  getMetric: () => undefined,
};

export function useCustomMetrics(): CustomMetricsValue {
  const ctx = useContext(CustomMetricsContext);
  return ctx ?? NOOP_VALUE;
}
