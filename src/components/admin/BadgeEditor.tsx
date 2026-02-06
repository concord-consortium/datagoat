import { useState, useEffect } from "react";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import type { BadgeDefinition } from "../../types/badges";

export function BadgeEditor() {
  const [badges, setBadges] = useState<BadgeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: "streak" as BadgeDefinition["type"],
    metric: "",
    threshold: 0,
    window: 7,
    streakDays: 3,
    messageTemplate: "",
  });

  async function loadBadges() {
    setLoading(true);
    const snap = await getDocs(collection(db, "config", "badges", "items"));
    setBadges(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BadgeDefinition),
    );
    setLoading(false);
  }

  useEffect(() => {
    loadBadges();
  }, []);

  async function handleSave() {
    const id = editId ?? `badge-${Date.now()}`;
    const data: Record<string, unknown> = {
      name: form.name,
      type: form.type,
      messageTemplate: form.messageTemplate,
      schemaVersion: 1,
    };
    if (form.type === "streak") data.streakDays = form.streakDays;
    if (form.type === "threshold") {
      data.metric = form.metric;
      data.threshold = form.threshold;
      data.window = form.window;
    }
    await setDoc(doc(db, "config", "badges", "items", id), data);
    resetForm();
    await loadBadges();
  }

  async function handleDelete(id: string) {
    await deleteDoc(doc(db, "config", "badges", "items", id));
    await loadBadges();
  }

  function startEdit(badge: BadgeDefinition) {
    setEditId(badge.id);
    setForm({
      name: badge.name,
      type: badge.type,
      metric: badge.metric ?? "",
      threshold: badge.threshold ?? 0,
      window: badge.window ?? 7,
      streakDays: badge.streakDays ?? 3,
      messageTemplate: badge.messageTemplate,
    });
  }

  function resetForm() {
    setEditId(null);
    setForm({
      name: "",
      type: "streak",
      metric: "",
      threshold: 0,
      window: 7,
      streakDays: 3,
      messageTemplate: "",
    });
  }

  if (loading) return <span className="loading loading-spinner" />;

  return (
    <div className="space-y-4">
      <h2 className="font-semibold">Badge Definitions</h2>

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Details</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {badges.map((b) => (
              <tr key={b.id}>
                <td>{b.name}</td>
                <td>{b.type}</td>
                <td className="text-xs">
                  {b.type === "streak" && `${b.streakDays} days`}
                  {b.type === "threshold" &&
                    `${b.metric}: ${b.threshold} over ${b.window}d`}
                  {b.type === "complete-entry" && "All metrics logged"}
                </td>
                <td className="flex gap-1">
                  <button className="btn btn-ghost btn-xs" onClick={() => startEdit(b)}>
                    Edit
                  </button>
                  <button
                    className="btn btn-ghost btn-xs text-error"
                    onClick={() => handleDelete(b.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card bg-base-200 p-4 space-y-3">
        <h3 className="font-medium text-sm">{editId ? "Edit Badge" : "Add Badge"}</h3>
        <input
          className="input input-bordered input-sm w-full"
          placeholder="Badge name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select
          className="select select-bordered select-sm"
          value={form.type}
          onChange={(e) =>
            setForm({ ...form, type: e.target.value as BadgeDefinition["type"] })
          }
        >
          <option value="streak">Streak</option>
          <option value="threshold">Threshold</option>
          <option value="complete-entry">Complete Entry</option>
        </select>

        {form.type === "streak" && (
          <input
            type="number"
            className="input input-bordered input-sm w-24"
            placeholder="Days"
            value={form.streakDays}
            onChange={(e) => setForm({ ...form, streakDays: Number(e.target.value) })}
          />
        )}

        {form.type === "threshold" && (
          <div className="flex gap-2">
            <input
              className="input input-bordered input-sm flex-1"
              placeholder="Metric ID"
              value={form.metric}
              onChange={(e) => setForm({ ...form, metric: e.target.value })}
            />
            <input
              type="number"
              className="input input-bordered input-sm w-24"
              placeholder="Threshold"
              value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })}
            />
            <input
              type="number"
              className="input input-bordered input-sm w-24"
              placeholder="Window (days)"
              value={form.window}
              onChange={(e) => setForm({ ...form, window: Number(e.target.value) })}
            />
          </div>
        )}

        <textarea
          className="textarea textarea-bordered w-full"
          placeholder="Message template (use {name})"
          value={form.messageTemplate}
          onChange={(e) => setForm({ ...form, messageTemplate: e.target.value })}
        />

        <div className="flex gap-2">
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={!form.name || !form.messageTemplate}
          >
            {editId ? "Update" : "Add"}
          </button>
          {editId && (
            <button className="btn btn-ghost btn-sm" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
