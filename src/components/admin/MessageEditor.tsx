import { useState, useEffect } from "react";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../services/firebase";

interface Message {
  id: string;
  text: string;
  triggerType: string;
  triggerValue: number;
}

export function MessageEditor() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ text: "", triggerType: "streak", triggerValue: 0 });

  async function loadMessages() {
    setLoading(true);
    const snap = await getDocs(collection(db, "config", "messages", "items"));
    setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message));
    setLoading(false);
  }

  useEffect(() => {
    loadMessages();
  }, []);

  async function handleSave() {
    const id = editId ?? `msg-${Date.now()}`;
    await setDoc(doc(db, "config", "messages", "items", id), {
      text: form.text,
      triggerType: form.triggerType,
      triggerValue: form.triggerValue,
    });
    setEditId(null);
    setForm({ text: "", triggerType: "streak", triggerValue: 0 });
    await loadMessages();
  }

  async function handleDelete(id: string) {
    await deleteDoc(doc(db, "config", "messages", "items", id));
    await loadMessages();
  }

  function startEdit(msg: Message) {
    setEditId(msg.id);
    setForm({ text: msg.text, triggerType: msg.triggerType, triggerValue: msg.triggerValue });
  }

  if (loading) {
    return <span className="loading loading-spinner" />;
  }

  return (
    <div className="space-y-4">
      <h2 className="font-semibold">Motivational Messages</h2>
      <p className="text-sm text-base-content/60">
        Use {"{name}"} as a placeholder for the athlete's name.
      </p>

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Message</th>
              <th>Trigger</th>
              <th>Value</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {messages.map((msg) => (
              <tr key={msg.id}>
                <td className="max-w-xs truncate">{msg.text}</td>
                <td>{msg.triggerType}</td>
                <td>{msg.triggerValue}</td>
                <td className="flex gap-1">
                  <button className="btn btn-ghost btn-xs" onClick={() => startEdit(msg)}>
                    Edit
                  </button>
                  <button
                    className="btn btn-ghost btn-xs text-error"
                    onClick={() => handleDelete(msg.id)}
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
        <h3 className="font-medium text-sm">
          {editId ? "Edit Message" : "Add Message"}
        </h3>
        <textarea
          className="textarea textarea-bordered w-full"
          placeholder='e.g., Keep going, {name}! Your streak is on fire!'
          value={form.text}
          onChange={(e) => setForm({ ...form, text: e.target.value })}
        />
        <div className="flex gap-3">
          <select
            className="select select-bordered select-sm"
            value={form.triggerType}
            onChange={(e) => setForm({ ...form, triggerType: e.target.value })}
          >
            <option value="streak">Streak</option>
            <option value="threshold">Threshold</option>
            <option value="default">Default</option>
          </select>
          <input
            type="number"
            className="input input-bordered input-sm w-24"
            value={form.triggerValue}
            onChange={(e) => setForm({ ...form, triggerValue: Number(e.target.value) })}
          />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!form.text}>
            {editId ? "Update" : "Add"}
          </button>
          {editId && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setEditId(null);
                setForm({ text: "", triggerType: "streak", triggerValue: 0 });
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
