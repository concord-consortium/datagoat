import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getRecentBodyEntries } from "../services/bodyEntries";
import { ALL_METRICS } from "../data/defaultMetrics";
import { DEFAULT_BADGES } from "../data/defaultBadges";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import type { MetricDefinition } from "../types/metrics";
import type { BodyEntry } from "../types/entries";

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
  annotationPlugin,
);

type DateRange = 7 | 14 | 30;

export function MetricDetailPage() {
  const { metricId } = useParams<{ metricId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<BodyEntry[]>([]);
  const [range, setRange] = useState<DateRange>(14);
  const [loading, setLoading] = useState(true);

  const metric = ALL_METRICS.find(
    (m) => m.id === metricId,
  ) as MetricDefinition | undefined;

  useEffect(() => {
    if (!user || !metricId) return;
    setLoading(true);
    getRecentBodyEntries(user.uid, range).then((data) => {
      setEntries(data);
      setLoading(false);
    });
  }, [user, metricId, range]);

  if (!metric) {
    return (
      <div className="p-4">
        <p className="text-error">Metric not found.</p>
        <button className="btn btn-ghost btn-sm mt-2" onClick={() => navigate(-1)}>
          Go back
        </button>
      </div>
    );
  }

  const sorted = entries
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const labels = sorted.map((e) => {
    const d = new Date(e.date + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });

  const values = sorted.map((e) => e.metrics[metric.id]?.value ?? null);
  const validValues = values.filter((v): v is number => v !== null);
  const average =
    validValues.length > 0
      ? validValues.reduce((a, b) => a + b, 0) / validValues.length
      : null;

  const goalBadge = DEFAULT_BADGES.find(
    (b) => b.type === "threshold" && b.metric === metric.id,
  );
  const goalValue = goalBadge?.threshold ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annotations: Record<string, any> = {};
  if (goalValue !== null) {
    annotations["goalLine"] = {
      type: "line",
      yMin: goalValue,
      yMax: goalValue,
      borderColor: "#7bdcb5",
      borderWidth: 2,
      borderDash: [6, 4],
      label: {
        display: true,
        content: `Goal: ${goalValue}`,
        position: "start",
        backgroundColor: "rgba(123, 220, 181, 0.8)",
        font: { size: 13 },
      },
    };
  }
  if (average !== null) {
    annotations["avgLine"] = {
      type: "line",
      yMin: average,
      yMax: average,
      borderColor: "#ffc222",
      borderWidth: 1.5,
      borderDash: [3, 3],
      label: {
        display: true,
        content: `Avg: ${average.toFixed(1)}`,
        position: "end",
        backgroundColor: "rgba(255, 194, 34, 0.8)",
        font: { size: 13 },
      },
    };
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => navigate(-1)}
      >
        &larr; Back
      </button>

      <div>
        <h2 className="text-xl font-bold">
          {metric.name}{" "}
          <span className="text-base-content/50 text-base font-normal">
            ({metric.unit})
          </span>
        </h2>
        <p className="text-base text-base-content/70 mt-1">
          {metric.description}
        </p>
        {metric.learnMoreUrl && (
          <a
            href={metric.learnMoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="link link-primary text-base"
          >
            Learn more
          </a>
        )}
      </div>

      <div className="flex gap-1">
        {([7, 14, 30] as DateRange[]).map((r) => (
          <button
            key={r}
            className={`btn btn-sm ${range === r ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setRange(r)}
          >
            {r}d
          </button>
        ))}
      </div>

      {validValues.length === 0 ? (
        <div className="card bg-base-100 shadow-sm p-6 text-center">
          <p className="text-base-content/50">
            No data for the last {range} days.
          </p>
        </div>
      ) : (
        <div className="card bg-base-100 shadow-sm p-4">
          <div className="h-64">
            <Line
              data={{
                labels,
                datasets: [
                  {
                    label: metric.name,
                    data: values,
                    borderColor: "#0693e3",
                    backgroundColor: "rgba(6, 147, 227, 0.1)",
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: "#0693e3",
                    fill: true,
                    tension: 0.3,
                    spanGaps: true,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: { enabled: true },
                  annotation: { annotations },
                },
                scales: {
                  x: {
                    ticks: { font: { size: 12 } },
                  },
                  y: {
                    beginAtZero: true,
                    ticks: { font: { size: 12 } },
                  },
                },
              }}
            />
          </div>
        </div>
      )}

      {average !== null && (
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-title">Average ({range}d)</div>
            <div className="stat-value text-primary">
              {average.toFixed(1)}
            </div>
            <div className="stat-desc">{metric.unit}</div>
          </div>
          <div className="stat">
            <div className="stat-title">Entries</div>
            <div className="stat-value">{validValues.length}</div>
            <div className="stat-desc">of {range} days</div>
          </div>
        </div>
      )}
    </div>
  );
}
