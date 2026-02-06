import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { MessageEditor } from "../components/admin/MessageEditor";
import { SportMappingEditor } from "../components/admin/SportMappingEditor";
import { BadgeEditor } from "../components/admin/BadgeEditor";
import { MetricEditor } from "../components/admin/MetricEditor";

type Tab = "messages" | "sports" | "badges" | "metrics";

export function AdminPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("messages");

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Admin Dashboard</h1>

      <div role="tablist" className="tabs tabs-boxed">
        {(
          [
            ["messages", "Messages"],
            ["sports", "Sport Mappings"],
            ["badges", "Badges"],
            ["metrics", "Metrics"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            className={`tab ${tab === key ? "tab-active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "messages" && <MessageEditor />}
      {tab === "sports" && <SportMappingEditor />}
      {tab === "badges" && <BadgeEditor />}
      {tab === "metrics" && <MetricEditor />}
    </div>
  );
}
