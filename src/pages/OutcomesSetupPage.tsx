import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getProfile, updateProfileField } from "../services/profile";
import { getMetricDefinitions, getSportDefaults } from "../services/metrics";
import {
  getUserOutcomeMetrics,
  saveUserOutcomeMetrics,
} from "../services/userMetrics";
import type { MetricDefinition } from "../types/metrics";
import type { Sport } from "../types/profile";

export function OutcomesSetupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [outcomeMetrics, setOutcomeMetrics] = useState<MetricDefinition[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    async function load() {
      const [profile, metrics] = await Promise.all([
        getProfile(user!.uid),
        getMetricDefinitions(),
      ]);

      const outcomes = metrics.filter((m) => m.category === "outcome");
      setOutcomeMetrics(outcomes);

      const sport: Sport = profile?.sport ?? "baseball";
      const sportDefs = await getSportDefaults(sport);

      const existing = await getUserOutcomeMetrics(user!.uid);
      if (existing) {
        setSelected(new Set(existing.selectedMetricIds));
      } else {
        setSelected(new Set(sportDefs.defaultOutcomeMetrics));
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
    await saveUserOutcomeMetrics(user.uid, Array.from(selected));
    await updateProfileField(user.uid, { outcomesSetupComplete: true });
    setSaving(false);
    navigate("/profile");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Setup Your Outcomes Data</h1>
      <p className="text-base text-base-content/70">
        Select which sport outcomes you want to track.
      </p>

      <div className="space-y-2">
        {outcomeMetrics.map((m) => (
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

      <button
        className="btn btn-primary w-full"
        onClick={handleSave}
        disabled={saving || selected.size === 0}
      >
        {saving ? (
          <span className="loading loading-spinner loading-sm" />
        ) : (
          `Save (${selected.size} outcomes selected)`
        )}
      </button>
    </div>
  );
}
