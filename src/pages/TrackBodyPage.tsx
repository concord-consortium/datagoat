import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getUserDailyMetrics } from "../services/userMetrics";
import { getBodyEntry, saveBodyMetric, deleteBodyMetric, getRecentBodyEntries } from "../services/bodyEntries";
import { ALL_METRICS } from "../data/defaultMetrics";
import { getTodayDateString } from "../services/streaks";
import { DateNavigation } from "../components/DateNavigation";
import { SparklineChart } from "../components/SparklineChart";
import { HydrationInput } from "../components/inputs/HydrationInput";
import { ScaleInput } from "../components/inputs/ScaleInput";
import { NumericInput } from "../components/inputs/NumericInput";
import { BinaryInput } from "../components/inputs/BinaryInput";
import { ExportButton } from "../components/ExportButton";
import type { MetricDefinition } from "../types/metrics";
import type { BodyEntry } from "../types/entries";

export function TrackBodyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(getTodayDateString());
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [entry, setEntry] = useState<BodyEntry | null>(null);
  const [recentEntries, setRecentEntries] = useState<BodyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteMetricId, setDeleteMetricId] = useState<string | null>(null);

  const loadData = useCallback(async (showSpinner = false) => {
    if (!user) return;
    if (showSpinner) setLoading(true);
    const [config, bodyEntry, recent] = await Promise.all([
      getUserDailyMetrics(user.uid),
      getBodyEntry(user.uid, date),
      getRecentBodyEntries(user.uid, 14),
    ]);

    const selectedIds = config?.selectedMetricIds ?? [];
    const selected = selectedIds
      .map((id) => ALL_METRICS.find((m) => m.id === id))
      .filter((m): m is MetricDefinition => m !== undefined);

    setMetrics(selected);
    setEntry(bodyEntry);
    setRecentEntries(recent);
    setLoading(false);
  }, [user, date]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  async function handleSave(metricId: string, value: number) {
    if (!user) return;
    await saveBodyMetric(user.uid, date, metricId, value);
    await loadData();
  }

  async function handleDelete(metricId: string) {
    if (!user) return;
    await deleteBodyMetric(user.uid, date, metricId);
    setDeleteMetricId(null);
    await loadData();
  }

  function getSparklineData(metricId: string): number[] {
    return recentEntries
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => e.metrics[metricId]?.value)
      .filter((v): v is number => v !== undefined);
  }

  function renderInput(metric: MetricDefinition) {
    const currentValue = entry?.metrics[metric.id]?.value ?? null;

    switch (metric.inputType) {
      case "color-scale":
        return (
          <HydrationInput
            value={currentValue}
            onChange={(v) => handleSave(metric.id, v)}
          />
        );
      case "scale-1-5":
        return (
          <ScaleInput
            value={currentValue}
            onChange={(v) => handleSave(metric.id, v)}
            metricId={metric.id}
          />
        );
      case "binary":
        return (
          <BinaryInput
            value={currentValue}
            onChange={(v) => handleSave(metric.id, v)}
          />
        );
      default:
        return (
          <NumericInput
            value={currentValue}
            onChange={(v) => handleSave(metric.id, v)}
            min={metric.min}
            max={metric.max}
            unit={metric.unit}
          />
        );
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="card bg-base-100 shadow-sm p-6 text-center">
        <p className="text-base-content/60 mb-4">
          No daily metrics configured yet.
        </p>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => navigate("/setup/daily")}
        >
          Set Up Daily Metrics
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DateNavigation date={date} onDateChange={setDate} />

      <div className="space-y-3">
        {metrics.map((metric) => (
          <div
            key={metric.id}
            className="card bg-base-100 shadow-sm p-3"
          >
            <div className="flex items-center gap-3 mb-2">
              <SparklineChart
                data={getSparklineData(metric.id)}
                metricName={metric.name}
              />
              <button
                className="font-medium text-base text-primary hover:underline flex-1 text-left"
                onClick={() => navigate(`/track/body/${metric.id}`)}
              >
                {metric.name}
              </button>
              {entry?.metrics[metric.id] && (
                <button
                  className="btn btn-ghost btn-xs text-error"
                  onClick={() => setDeleteMetricId(metric.id)}
                  aria-label={`Delete ${metric.name} entry`}
                >
                  &#x1f5d1;
                </button>
              )}
            </div>

            {renderInput(metric)}
          </div>
        ))}
      </div>

      <ExportButton entries={recentEntries} metrics={metrics} type="body" />

      <button
        className="btn btn-disabled btn-outline btn-sm w-full"
        disabled
        title="CODAP integration coming soon"
      >
        Send to CODAP — Coming Soon
      </button>

      {/* Delete confirmation modal */}
      {deleteMetricId && (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Delete Entry</h3>
            <p className="py-4">
              Remove the {metrics.find((m) => m.id === deleteMetricId)?.name} entry for this date?
            </p>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => setDeleteMetricId(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-error"
                onClick={() => handleDelete(deleteMetricId)}
              >
                Delete
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setDeleteMetricId(null)}>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
}
