import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getUserOutcomeMetrics } from "../services/userMetrics";
import {
  getOutcomeEntry,
  saveOutcomeMetric,
  deleteOutcomeMetric,
  getRecentOutcomeEntries,
  computeTotals,
} from "../services/outcomeEntries";
import { ALL_METRICS } from "../data/defaultMetrics";
import { getTodayDateString } from "../services/streaks";
import { DateNavigation } from "../components/DateNavigation";
import { NumericInput } from "../components/inputs/NumericInput";
import { ExportButton } from "../components/ExportButton";
import { useNavigate } from "react-router-dom";
import type { MetricDefinition } from "../types/metrics";
import type { OutcomeEntry } from "../types/entries";

export function TrackOutcomesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(getTodayDateString());
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [entry, setEntry] = useState<OutcomeEntry | null>(null);
  const [recentEntries, setRecentEntries] = useState<OutcomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteMetricId, setDeleteMetricId] = useState<string | null>(null);

  const loadData = useCallback(async (showSpinner = false) => {
    if (!user) return;
    if (showSpinner) setLoading(true);
    const [config, outcomeEntry, recent] = await Promise.all([
      getUserOutcomeMetrics(user.uid),
      getOutcomeEntry(user.uid, date),
      getRecentOutcomeEntries(user.uid, 30),
    ]);

    const selectedIds = config?.selectedMetricIds ?? [];
    const selected = selectedIds
      .map((id) => ALL_METRICS.find((m) => m.id === id))
      .filter((m): m is MetricDefinition => m !== undefined);

    setMetrics(selected);
    setEntry(outcomeEntry);
    setRecentEntries(recent);
    setLoading(false);
  }, [user, date]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  async function handleSave(metricId: string, value: number) {
    if (!user) return;
    await saveOutcomeMetric(user.uid, date, metricId, value);
    await loadData();
  }

  async function handleDelete(metricId: string) {
    if (!user) return;
    await deleteOutcomeMetric(user.uid, date, metricId);
    setDeleteMetricId(null);
    await loadData();
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
          No outcome metrics configured yet.
        </p>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => navigate("/setup/outcomes")}
        >
          Set Up Outcome Metrics
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DateNavigation date={date} onDateChange={setDate} />

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Total</th>
              <th>Metric</th>
              <th>Value</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => {
              const total = computeTotals(recentEntries, metric.id);
              const currentValue = entry?.metrics[metric.id]?.value ?? null;

              return (
                <tr key={metric.id}>
                  <td className="font-mono text-base">{total}</td>
                  <td className="font-medium text-base">{metric.name}</td>
                  <td className="w-40">
                    <NumericInput
                      value={currentValue}
                      onChange={(v) => handleSave(metric.id, v)}
                      min={metric.min}
                      max={metric.max}
                      unit={metric.unit}
                    />
                  </td>
                  <td>
                    {currentValue !== null && (
                      <button
                        className="btn btn-ghost btn-xs text-error"
                        onClick={() => setDeleteMetricId(metric.id)}
                        aria-label={`Delete ${metric.name} entry`}
                      >
                        &#x1f5d1;
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ExportButton entries={recentEntries} metrics={metrics} type="outcome" />

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
              Remove the{" "}
              {metrics.find((m) => m.id === deleteMetricId)?.name} entry for
              this date?
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
