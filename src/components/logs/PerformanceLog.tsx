import { useEffect, useMemo, useRef } from "react";
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
import type { PerformanceEntry } from "../../types/data";
import css from "./PerformanceLog.module.css";

const DEBOUNCE_MS = 500;

function emptyEntry(date: string): PerformanceEntry {
  return { version: 1, date, metrics: {} };
}

// Merge two PerformanceEntry partials. The top-level keys (date, version)
// shallow-merge; the nested `metrics` map deep-merges so accumulating
// writes across multiple metric inputs within the debounce window
// preserves all fields.
function mergePartials(
  prev: Partial<PerformanceEntry>,
  next: Partial<PerformanceEntry>,
): Partial<PerformanceEntry> {
  return {
    ...prev,
    ...next,
    metrics: { ...(prev.metrics ?? {}), ...(next.metrics ?? {}) },
  };
}

export function PerformanceLog() {
  const [searchParams] = useSearchParams();
  const { loadState } = useUser();
  const { performance, setPerformanceEntry } = useData();

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
    entries.find((e) => e.date === dateIso) ?? emptyEntry(dateIso);

  // Debounced writes via accumulator pattern - identical contract to
  // WellnessLog (per spec Step 12). Kept inline rather than extracted
  // to a shared util because PerformanceEntry's nested `metrics` map
  // requires a deep-merge for the partials, while WellnessEntry's flat
  // shape works with a shallow spread; the merge function is the only
  // shared seam and forcing it through a generic util adds friction.
  const pendingRef = useRef<{
    date: string | null;
    partial: Partial<PerformanceEntry>;
  }>({ date: null, partial: {} });
  const timerRef = useRef<number | null>(null);

  const flushPending = () => {
    const { date, partial } = pendingRef.current;
    // Object.keys check is load-bearing under Strict Mode's mount->unmount
    // ->remount cycle - without it, the first cleanup fires a no-op write
    // of an empty object. Look at both top-level partial keys and nested
    // metrics keys: a partial that only sets metrics still has content.
    const hasContent =
      Object.keys(partial).length > 0 &&
      (Object.keys(partial).some((k) => k !== "metrics") ||
        Object.keys(partial.metrics ?? {}).length > 0);
    if (date && hasContent) {
      void setPerformanceEntry(date, partial);
    }
    pendingRef.current = { date: null, partial: {} };
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const queueWrite = (
    date: string,
    partial: Partial<PerformanceEntry>,
  ) => {
    // If the user just navigated to a different date, flush the prior
    // date's pending writes before starting a new accumulator for the
    // new date.
    if (
      pendingRef.current.date !== null &&
      pendingRef.current.date !== date
    ) {
      flushPending();
    }
    pendingRef.current = {
      date,
      partial: mergePartials(pendingRef.current.partial, partial),
    };
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      flushPending();
    }, DEBOUNCE_MS);
  };

  // Flush pending writes on date change.
  useEffect(() => {
    return () => {
      flushPending();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateIso]);

  // Flush on unmount.
  useEffect(() => {
    return () => {
      flushPending();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (shouldRedirect) {
    return <Navigate to="/performance" replace />;
  }

  function setMetricValue(metricId: string, raw: string) {
    const numeric = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(numeric)) return;
    queueWrite(dateIso, { metrics: { [metricId]: numeric } });
  }

  // Live-display values overlay the pending accumulator on the committed
  // entry so the user sees their just-typed value immediately.
  function liveMetric(metricId: string): number | string | undefined {
    const pending = pendingRef.current.partial.metrics ?? {};
    if (
      pendingRef.current.date === dateIso &&
      Object.prototype.hasOwnProperty.call(pending, metricId)
    ) {
      return pending[metricId];
    }
    return currentEntry.metrics?.[metricId];
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
              const live = liveMetric(metric.id);
              const stringValue =
                typeof live === "number" && live > 0
                  ? String(live)
                  : typeof live === "string" && live !== ""
                    ? live
                    : "";
              const filled = stringValue !== "";
              const total = performanceTotal(entries, metric.id);
              return (
                <tr key={metric.id}>
                  <td className={css.colTotal}>
                    {total > 0 ? String(total) : ""}
                  </td>
                  <td className={css.colMetric}>
                    <Link
                      to={`/performance/${metric.id}`}
                      className={css.metricLink}
                    >
                      {metric.name}
                    </Link>
                  </td>
                  <td className={css.colRecord}>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className={`${css.valueInput} ${filled ? css.hasValue : ""}`}
                      value={stringValue}
                      onChange={(e) => setMetricValue(metric.id, e.target.value)}
                      aria-label={metric.name}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className={css.designerNote}>
          <em>
            Note: needs further work; do we differentiate game vs practice?
            What are the default sets for E vs SP? etc.
          </em>
        </p>
      </div>
    </>
  );
}
