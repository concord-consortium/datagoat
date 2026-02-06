import type { BodyEntry, OutcomeEntry } from "../types/entries";
import type { MetricDefinition } from "../types/metrics";

interface ExportButtonProps {
  entries: (BodyEntry | OutcomeEntry)[];
  metrics: MetricDefinition[];
  type: "body" | "outcome";
}

export function ExportButton({ entries, metrics, type }: ExportButtonProps) {
  function handleExport() {
    const rows: string[][] = [["Date", "Metric", "Value", "Tags"]];

    const metricMap = new Map(metrics.map((m) => [m.id, m.name]));

    const sorted = entries.slice().sort((a, b) => a.date.localeCompare(b.date));
    for (const entry of sorted) {
      for (const [metricId, data] of Object.entries(entry.metrics)) {
        rows.push([
          entry.date,
          metricMap.get(metricId) ?? metricId,
          String(data.value),
          (data.tags ?? []).join("; "),
        ]);
      }
    }

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `datagoat-${type}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      className="btn btn-outline btn-sm w-full"
      onClick={handleExport}
      disabled={entries.length === 0}
    >
      Export as CSV
    </button>
  );
}
