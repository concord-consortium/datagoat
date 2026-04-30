import { useId, useMemo } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { DateNav } from "../layout/DateNav";
import { useUser } from "../../contexts/UserContext";
import { useData } from "../../contexts/DataContext";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import {
  HISTORY,
  dateAtOffset,
  dateOffsetFromISO,
  toISO,
} from "../../utils/dates";
import { performanceTotal } from "./PerformanceTotals";
import { emptyPerformanceEntry } from "../../types/data";
import { PerformanceMetricInput } from "./PerformanceMetricInput";
import css from "./PerformanceLog.module.css";

export function PerformanceLog() {
  const [searchParams] = useSearchParams();
  const { loadState } = useUser();
  const { performance, setPerformanceEntry } = useData();
  const nameIdBase = useId();

  const dateParam = searchParams.get("date");
  const requestedOffset = useMemo(() => {
    if (!dateParam) return HISTORY;
    return dateOffsetFromISO(dateParam);
  }, [dateParam]);

  // Malformed or out-of-range ?date= triggers a fallback Navigate. Same
  // hook-order safety as WellnessLog: compute the redirect flag so all
  // hooks below run unconditionally.
  const shouldRedirect =
    dateParam !== null &&
    (Number.isNaN(requestedOffset) ||
      requestedOffset < 0 ||
      requestedOffset > HISTORY);

  const offset =
    shouldRedirect || Number.isNaN(requestedOffset)
      ? HISTORY
      : requestedOffset;
  const dateIso = toISO(dateAtOffset(offset));

  const profile = loadState.status === "loaded" ? loadState.profile : null;
  // Default to all metrics when the profile isn't yet loaded - keeps the
  // table populated during the brief Firestore-fetch window after a hard
  // refresh; ProtectedRoute already gates so this branch is only the
  // mount->loaded transition.
  const trackedIds =
    profile?.trackedPerformanceMetrics ?? PERFORMANCE_METRICS.map((m) => m.id);

  const entries = performance.status === "loaded" ? performance.entries : [];
  const currentEntry =
    entries.find((e) => e.date === dateIso) ?? emptyPerformanceEntry(dateIso);

  if (shouldRedirect) {
    return <Navigate to="/performance" replace />;
  }

  function setMetricValue(metricId: string, raw: string) {
    const numeric = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(numeric)) return;
    setPerformanceEntry(dateIso, { metrics: { [metricId]: numeric } });
  }

  const displayedMetrics = PERFORMANCE_METRICS.filter((m) =>
    trackedIds.includes(m.id),
  );

  // Welcome shown only during onboarding (matches prototype's
  // .profile-welcome.show gate keyed on window.isNewUser).
  const isOnboarding =
    loadState.status === "missing" ||
    (loadState.status === "loaded" &&
      (!loadState.profile.profileComplete ||
        !loadState.profile.trackingSetupComplete));

  return (
    <>
      <DateNav offset={offset} withChip={false} />
      <div className={css.screenContent}>
        {isOnboarding && (
          <p className={css.profileWelcome}>
            <strong className={css.profileWelcomeTitle}>
              Your Performance Log
            </strong>
            Track your sport-specific performance data here. Log your numbers
            after each practice or competition to build a complete picture of
            your progress.
          </p>
        )}

        <table className={css.performanceLogTable}>
          <thead>
            <tr>
              <th>Total</th>
              <th>Metric</th>
              <th id="performance-log-value-header" className={css.colRecord}>
                Record
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedMetrics.map((metric) => {
              const live = currentEntry.metrics?.[metric.id];
              const stringValue =
                typeof live === "number" && live > 0
                  ? String(live)
                  : typeof live === "string" && live !== ""
                    ? live
                    : "";
              const filled = stringValue !== "";
              const total = performanceTotal(entries, metric.id);
              const nameCellId = `${nameIdBase}-${metric.id}`;
              return (
                <tr key={metric.id}>
                  <td className={css.colTotal}>
                    {total > 0 ? String(total) : ""}
                  </td>
                  <td id={nameCellId} className={css.colMetric}>
                    <Link
                      to={`/performance/${metric.id}`}
                      className={css.metricLink}
                    >
                      {metric.name}
                    </Link>
                  </td>
                  <td className={css.colRecord}>
                    <PerformanceMetricInput
                      metricId={metric.id}
                      labelledBy={nameCellId}
                      value={stringValue}
                      filled={filled}
                      onChange={(raw) => setMetricValue(metric.id, raw)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

