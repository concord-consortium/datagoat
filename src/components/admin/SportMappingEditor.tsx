import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import { SPORTS, SPORT_LABELS, type Sport } from "../../types/profile";
import { ALL_METRICS } from "../../data/defaultMetrics";

interface SportMapping {
  defaultBodyMetrics: string[];
  defaultTrainingMetrics: string[];
  defaultOutcomeMetrics: string[];
}

export function SportMappingEditor() {
  const [sport, setSport] = useState<Sport>(SPORTS[0]);
  const [mapping, setMapping] = useState<SportMapping>({
    defaultBodyMetrics: [],
    defaultTrainingMetrics: [],
    defaultOutcomeMetrics: [],
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadMapping(s: Sport) {
    setLoading(true);
    const snap = await getDoc(doc(db, "config", "sports", "items", s));
    if (snap.exists()) {
      setMapping(snap.data() as SportMapping);
    } else {
      setMapping({ defaultBodyMetrics: [], defaultTrainingMetrics: [], defaultOutcomeMetrics: [] });
    }
    setLoading(false);
  }

  useEffect(() => {
    loadMapping(sport);
  }, [sport]);

  async function handleSave() {
    setSaving(true);
    await setDoc(doc(db, "config", "sports", "items", sport), {
      sport,
      ...mapping,
      schemaVersion: 1,
    });
    setSaving(false);
  }

  function toggleMetric(field: keyof SportMapping, metricId: string) {
    setMapping((prev) => {
      const current = prev[field];
      const next = current.includes(metricId)
        ? current.filter((id) => id !== metricId)
        : [...current, metricId];
      return { ...prev, [field]: next };
    });
  }

  const bodyMetrics = ALL_METRICS.filter((m) => m.category === "body");
  const trainingMetrics = ALL_METRICS.filter((m) => m.category === "training");
  const outcomeMetrics = ALL_METRICS.filter((m) => m.category === "outcome");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">Sport Mappings</h2>
        <select
          className="select select-bordered select-sm"
          value={sport}
          onChange={(e) => setSport(e.target.value as Sport)}
        >
          {SPORTS.map((s) => (
            <option key={s} value={s}>{SPORT_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <span className="loading loading-spinner" />
      ) : (
        <div className="space-y-4">
          {([
            ["defaultBodyMetrics", "Body Metrics", bodyMetrics],
            ["defaultTrainingMetrics", "Training Metrics", trainingMetrics],
            ["defaultOutcomeMetrics", "Outcome Metrics", outcomeMetrics],
          ] as [keyof SportMapping, string, typeof bodyMetrics][]).map(
            ([field, label, metrics]) => (
              <div key={field}>
                <h3 className="text-sm font-medium mb-2">{label}</h3>
                <div className="flex flex-wrap gap-2">
                  {metrics.map((m) => (
                    <label key={m.id} className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-xs"
                        checked={mapping[field].includes(m.id)}
                        onChange={() => toggleMetric(field, m.id)}
                      />
                      {m.name}
                    </label>
                  ))}
                </div>
              </div>
            ),
          )}

          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Mapping"}
          </button>
        </div>
      )}
    </div>
  );
}
