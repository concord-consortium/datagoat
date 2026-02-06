import { useState, useEffect } from "react";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import { ALL_METRICS } from "../../data/defaultMetrics";
import type { MetricDefinition } from "../../types/metrics";

export function MetricEditor() {
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    unit: "",
    description: "",
    min: "",
    max: "",
    learnMoreUrl: "",
  });
  const [saving, setSaving] = useState(false);

  async function loadMetrics() {
    setLoading(true);
    const snap = await getDocs(collection(db, "config", "metrics", "items"));
    if (snap.empty) {
      setMetrics(ALL_METRICS);
    } else {
      setMetrics(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MetricDefinition),
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    loadMetrics();
  }, []);

  function startEdit(m: MetricDefinition) {
    setEditId(m.id);
    setForm({
      name: m.name,
      unit: m.unit,
      description: m.description,
      min: m.min?.toString() ?? "",
      max: m.max?.toString() ?? "",
      learnMoreUrl: m.learnMoreUrl ?? "",
    });
  }

  async function handleSave() {
    if (!editId) return;
    setSaving(true);
    const existing = metrics.find((m) => m.id === editId);
    if (!existing) return;

    const updated: Record<string, unknown> = {
      ...existing,
      name: form.name,
      unit: form.unit,
      description: form.description,
      learnMoreUrl: form.learnMoreUrl || undefined,
    };
    if (form.min !== "") updated.min = Number(form.min);
    if (form.max !== "") updated.max = Number(form.max);

    await setDoc(doc(db, "config", "metrics", "items", editId), updated);
    setEditId(null);
    setSaving(false);
    await loadMetrics();
  }

  if (loading) return <span className="loading loading-spinner" />;

  return (
    <div className="space-y-4">
      <h2 className="font-semibold">Metric Definitions</h2>

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Name</th>
              <th>Unit</th>
              <th>Type</th>
              <th>Range</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.unit}</td>
                <td className="text-xs">{m.inputType}</td>
                <td className="text-xs">
                  {m.min !== undefined && m.max !== undefined
                    ? `${m.min}–${m.max}`
                    : "—"}
                </td>
                <td>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => startEdit(m)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editId && (
        <div className="card bg-base-200 p-4 space-y-3">
          <h3 className="font-medium text-sm">Edit Metric: {editId}</h3>
          <input
            className="input input-bordered input-sm w-full"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input input-bordered input-sm w-full"
            placeholder="Unit"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
          <textarea
            className="textarea textarea-bordered w-full"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex gap-3">
            <input
              type="number"
              className="input input-bordered input-sm w-24"
              placeholder="Min"
              value={form.min}
              onChange={(e) => setForm({ ...form, min: e.target.value })}
            />
            <input
              type="number"
              className="input input-bordered input-sm w-24"
              placeholder="Max"
              value={form.max}
              onChange={(e) => setForm({ ...form, max: e.target.value })}
            />
          </div>
          <input
            className="input input-bordered input-sm w-full"
            placeholder="Learn more URL (optional)"
            value={form.learnMoreUrl}
            onChange={(e) => setForm({ ...form, learnMoreUrl: e.target.value })}
          />
          <div className="flex gap-2">
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || !form.name}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
