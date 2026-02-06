import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getProfile, updateProfileField } from "../services/profile";
import { getMetricDefinitions, getSportDefaults } from "../services/metrics";
import {
  getUserDailyMetrics,
  saveUserDailyMetrics,
  saveCustomMetric,
} from "../services/userMetrics";
import type { MetricDefinition } from "../types/metrics";
import type { Sport } from "../types/profile";
import { AddMeasurementModal } from "../components/AddMeasurementModal";

export function DailyDataSetupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allMetrics, setAllMetrics] = useState<MetricDefinition[]>([]);
  const [defaultIds, setDefaultIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdditional, setShowAdditional] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (!user) return;
    async function load() {
      const [profile, metrics] = await Promise.all([
        getProfile(user!.uid),
        getMetricDefinitions(),
      ]);

      const bodyAndTraining = metrics.filter(
        (m) => m.category === "body" || m.category === "training",
      );
      setAllMetrics(bodyAndTraining);

      const sport: Sport = profile?.sport ?? "baseball";
      const sportDefs = await getSportDefaults(sport);
      const onByDefault = [
        ...sportDefs.defaultBodyMetrics,
        ...sportDefs.defaultTrainingMetrics,
      ];
      setDefaultIds(onByDefault);

      const existing = await getUserDailyMetrics(user!.uid);
      if (existing) {
        setSelected(new Set(existing.selectedMetricIds));
      } else {
        setSelected(new Set(onByDefault));
      }
      setLoading(false);
    }
    load();
  }, [user]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    await saveUserDailyMetrics(user.uid, Array.from(selected));
    await updateProfileField(user.uid, { dailySetupComplete: true });
    setSaving(false);
    navigate("/profile");
  }

  async function handleAddCustom(metric: {
    name: string;
    unit: string;
    inputType: "numeric" | "scale-1-10" | "binary";
    min?: number;
    max?: number;
  }) {
    if (!user) return;
    const id = metric.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await saveCustomMetric(user.uid, { id, ...metric });
    const newMetric: MetricDefinition = {
      id,
      name: metric.name,
      unit: metric.unit,
      inputType: metric.inputType,
      category: "body",
      min: metric.min,
      max: metric.max,
      description: `Custom metric: ${metric.name}`,
      schemaVersion: 1,
    };
    setAllMetrics((prev) => [...prev, newMetric]);
    setSelected((prev) => new Set([...prev, id]));
    setShowAddModal(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  const defaultMetrics = allMetrics.filter((m) => defaultIds.includes(m.id));
  const additionalMetrics = allMetrics.filter(
    (m) => !defaultIds.includes(m.id),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Setup Your Daily Data</h1>
      <p className="text-base text-base-content/70">
        Select which metrics you want to track each day.
      </p>

      {/* Default metrics */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Recommended Metrics</h2>
        {defaultMetrics.map((m) => (
          <label
            key={m.id}
            className="flex items-center gap-3 p-2 rounded hover:bg-base-200 cursor-pointer"
          >
            <input
              type="checkbox"
              className="checkbox checkbox-primary checkbox-md"
              checked={selected.has(m.id)}
              onChange={() => toggle(m.id)}
            />
            <span className="flex-1">
              <span className="font-medium">{m.name}</span>
              <span className="text-sm text-base-content/60 ml-2">
                ({m.unit})
              </span>
            </span>
          </label>
        ))}
      </div>

      {/* Additional metrics (collapsed) */}
      <div className="collapse collapse-arrow bg-base-200">
        <input
          type="checkbox"
          checked={showAdditional}
          onChange={(e) => setShowAdditional(e.target.checked)}
        />
        <div className="collapse-title font-semibold">
          Additional Metrics ({additionalMetrics.length})
        </div>
        <div className="collapse-content space-y-2">
          {additionalMetrics.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-3 p-2 rounded hover:bg-base-100 cursor-pointer"
            >
              <input
                type="checkbox"
                className="checkbox checkbox-primary checkbox-md"
                checked={selected.has(m.id)}
                onChange={() => toggle(m.id)}
              />
              <span className="flex-1">
                <span className="font-medium">{m.name}</span>
                <span className="text-sm text-base-content/60 ml-2">
                  ({m.unit})
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setShowAddModal(true)}
        >
          + Add Measurement
        </button>
      </div>

      <button
        className="btn btn-primary w-full"
        onClick={handleSave}
        disabled={saving || selected.size === 0}
      >
        {saving ? (
          <span className="loading loading-spinner loading-sm" />
        ) : (
          `Save (${selected.size} metrics selected)`
        )}
      </button>

      {showAddModal && (
        <AddMeasurementModal
          onSave={handleAddCustom}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
