import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getProfile } from "../services/profile";
import { getUserDailyMetrics, getUserOutcomeMetrics } from "../services/userMetrics";
import { getBodyEntry, getRecentBodyEntries } from "../services/bodyEntries";
import { getRecentOutcomeEntries } from "../services/outcomeEntries";
import { getMetricDefinitions } from "../services/metrics";
import { calculateStreak, getTodayDateString, addDays } from "../services/streaks";
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
import type { Profile } from "../types/profile";
import type { BodyEntry, OutcomeEntry } from "../types/entries";

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

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [trackedBodyIds, setTrackedBodyIds] = useState<string[]>([]);
  const [trackedOutcomeIds, setTrackedOutcomeIds] = useState<string[]>([]);
  const [loggedToday, setLoggedToday] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState(0);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [bodyEntries, setBodyEntries] = useState<BodyEntry[]>([]);
  const [outcomeEntries, setOutcomeEntries] = useState<OutcomeEntry[]>([]);
  const [selectedBodyMetric, setSelectedBodyMetric] = useState("");
  const [selectedOutcomeMetric, setSelectedOutcomeMetric] = useState("");

  const today = getTodayDateString();

  useEffect(() => {
    if (!user) return;
    async function load() {
      const [prof, bodyConfig, outcomeConfig, todayEntry, recentBody, recentOutcome, allMetrics] =
        await Promise.all([
          getProfile(user!.uid),
          getUserDailyMetrics(user!.uid),
          getUserOutcomeMetrics(user!.uid),
          getBodyEntry(user!.uid, today),
          getRecentBodyEntries(user!.uid, 14),
          getRecentOutcomeEntries(user!.uid, 14),
          getMetricDefinitions(),
        ]);

      setProfile(prof);
      setMetrics(allMetrics);

      const bodyIds = bodyConfig?.selectedMetricIds ?? [];
      const outcomeIds = outcomeConfig?.selectedMetricIds ?? [];
      setTrackedBodyIds(bodyIds);
      setTrackedOutcomeIds(outcomeIds);
      setLoggedToday(
        new Set(todayEntry ? Object.keys(todayEntry.metrics) : []),
      );
      setStreak(calculateStreak(recentBody));
      setBodyEntries(recentBody);
      setOutcomeEntries(recentOutcome);

      if (bodyIds.length > 0) setSelectedBodyMetric((prev) => prev || bodyIds[0]);
      if (outcomeIds.length > 0) setSelectedOutcomeMetric((prev) => prev || outcomeIds[0]);

      setLoading(false);
    }
    load();
  }, [user, today]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  const hasSetup =
    profile?.dailySetupComplete || profile?.outcomesSetupComplete;

  if (!hasSetup) {
    return (
      <div className="text-center py-12 space-y-4">
        <h2 className="text-xl font-semibold">Welcome to DataGOAT!</h2>
        <p className="text-base-content/70">
          Start by setting up your profile and choosing what to track.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/profile")}
        >
          Set Up Profile
        </button>
      </div>
    );
  }

  const loggedCount = trackedBodyIds.filter((id) => loggedToday.has(id)).length;
  const totalCount = trackedBodyIds.length;

  const motivationalMessage =
    streak >= 30
      ? `30 days! You're a true data scientist now, ${profile?.username}!`
      : streak >= 14
        ? `2 weeks strong! Your data is telling a story, ${profile?.username}!`
        : streak >= 7
          ? `A full week of tracking! You're owning your data, ${profile?.username}!`
          : streak >= 5
            ? `Consistency is Key: ${streak} day streak! Go ${profile?.username}!`
            : streak >= 3
              ? `${streak} days in a row! You're building a habit, ${profile?.username}!`
              : `Welcome back, ${profile?.username}! Let's track today's data.`;

  // Calendar: last 14 days
  const bodyDateSet = new Set(
    bodyEntries
      .filter((e) => Object.keys(e.metrics).length > 0)
      .map((e) => e.date),
  );
  const calendarDays: { date: string; label: string; hasData: boolean }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const dt = new Date(d + "T00:00:00");
    calendarDays.push({
      date: d,
      label: dt.toLocaleDateString("en-US", { weekday: "narrow" }),
      hasData: bodyDateSet.has(d),
    });
  }

  // Body chart data
  const bodyMetricDef = metrics.find((m) => m.id === selectedBodyMetric);
  const sortedBody = bodyEntries.slice().sort((a, b) => a.date.localeCompare(b.date));
  const bodyLabels = sortedBody.map((e) => {
    const dt = new Date(e.date + "T00:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });
  const bodyValues = sortedBody.map((e) => e.metrics[selectedBodyMetric]?.value ?? null);

  const bodyGoalBadge = DEFAULT_BADGES.find(
    (b) => b.type === "threshold" && b.metric === selectedBodyMetric,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyAnnotations: Record<string, any> = {};
  if (bodyGoalBadge?.threshold != null) {
    bodyAnnotations["goalLine"] = {
      type: "line",
      yMin: bodyGoalBadge.threshold,
      yMax: bodyGoalBadge.threshold,
      borderColor: "#7bdcb5",
      borderWidth: 2,
      borderDash: [6, 4],
      label: {
        display: true,
        content: `Goal: ${bodyGoalBadge.threshold}`,
        position: "start",
        backgroundColor: "rgba(123, 220, 181, 0.8)",
        font: { size: 12 },
      },
    };
  }

  // Outcome chart data
  const outcomeMetricDef = metrics.find((m) => m.id === selectedOutcomeMetric);
  const sortedOutcome = outcomeEntries.slice().sort((a, b) => a.date.localeCompare(b.date));
  const outcomeLabels = sortedOutcome.map((e) => {
    const dt = new Date(e.date + "T00:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });
  const outcomeValues = sortedOutcome.map((e) => e.metrics[selectedOutcomeMetric]?.value ?? null);

  const bodyTrackedMetrics = trackedBodyIds
    .map((id) => metrics.find((m) => m.id === id))
    .filter(Boolean) as MetricDefinition[];

  const outcomeTrackedMetrics = trackedOutcomeIds
    .map((id) => metrics.find((m) => m.id === id))
    .filter(Boolean) as MetricDefinition[];

  return (
    <div className="space-y-6">
      {/* Motivational message */}
      <div className="card bg-secondary/10 border border-secondary/20">
        <div className="card-body py-3">
          <p className="text-base font-medium">{motivationalMessage}</p>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex justify-between text-base mb-1">
          <span>Today&apos;s Progress</span>
          <span>
            {loggedCount} of {totalCount} metrics logged
          </span>
        </div>
        <progress
          className="progress progress-primary w-full"
          value={loggedCount}
          max={totalCount}
        />
      </div>

      {/* 1. Tracking calendar — last 14 days */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4">
          <h2 className="text-base font-semibold text-base-content/70 mb-2">
            Tracking Calendar
          </h2>
          <div className="flex gap-1 justify-between">
            {calendarDays.map((day) => (
              <div key={day.date} className="flex flex-col items-center gap-1">
                <span className="text-xs text-base-content/50">
                  {day.label}
                </span>
                <div
                  className={`w-7 h-7 rounded-sm ${
                    day.hasData ? "bg-primary" : "bg-base-300"
                  } ${day.date === today ? "ring-2 ring-secondary" : ""}`}
                  title={`${day.date}${day.hasData ? " — data logged" : " — no data"}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. My Body chart */}
      {bodyTrackedMetrics.length > 0 && (
        <div
          className="card bg-base-100 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/track/body")}
        >
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold">My Body</h2>
              <select
                className="select select-bordered select-sm"
                value={selectedBodyMetric}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setSelectedBodyMetric(e.target.value)}
              >
                {bodyTrackedMetrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="h-40">
              {bodyValues.some((v) => v !== null) ? (
                <Line
                  data={{
                    labels: bodyLabels,
                    datasets: [
                      {
                        label: bodyMetricDef?.name ?? selectedBodyMetric,
                        data: bodyValues,
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
                      annotation: { annotations: bodyAnnotations },
                    },
                    scales: {
                      x: { ticks: { font: { size: 12 }, maxRotation: 0 } },
                      y: {
                        beginAtZero: true,
                        ticks: { font: { size: 12 } },
                      },
                    },
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-base-content/40 text-base">
                  No data yet — start tracking!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. My Sport chart */}
      {outcomeTrackedMetrics.length > 0 && (
        <div
          className="card bg-base-100 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/track/outcomes")}
        >
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold">My Sport</h2>
              <select
                className="select select-bordered select-sm"
                value={selectedOutcomeMetric}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setSelectedOutcomeMetric(e.target.value)}
              >
                {outcomeTrackedMetrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="h-40">
              {outcomeValues.some((v) => v !== null) ? (
                <Line
                  data={{
                    labels: outcomeLabels,
                    datasets: [
                      {
                        label: outcomeMetricDef?.name ?? selectedOutcomeMetric,
                        data: outcomeValues,
                        borderColor: "#ffc222",
                        backgroundColor: "rgba(255, 194, 34, 0.1)",
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: "#ffc222",
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
                    },
                    scales: {
                      x: { ticks: { font: { size: 12 }, maxRotation: 0 } },
                      y: {
                        beginAtZero: true,
                        ticks: { font: { size: 12 } },
                      },
                    },
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-base-content/40 text-base">
                  No data yet — start tracking!
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
