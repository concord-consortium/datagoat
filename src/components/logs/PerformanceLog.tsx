import { useId, useMemo } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { DateNav } from "../layout/DateNav";
import { useUser } from "../../contexts/UserContext";
import { useData } from "../../contexts/DataContext";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import { ADDABLE_PERFORMANCE } from "../../metrics/addableMetrics";
import {
  HISTORY,
  dateAtOffset,
  historyOffsetFromISO,
  toISO,
} from "../../utils/dates";
import { emptyPerformanceEntry } from "../../types/data";
import { CompetitionMetricInput } from "./CompetitionMetricInput";
import { OrdinalRadioGroup } from "./OrdinalRadioGroup";
import css from "./PerformanceLog.module.css";

// Mirrors CompetitionLog. Performance entries share the same map
// shape as competition entries (no per-metric named fields), so the
// rendering loop is structurally identical. Built-in performance
// registry is empty by default (per DGT-51 sheet); the screen renders
// an "Add a metric" CTA when no metrics are tracked.
export function PerformanceLog() {
  const [searchParams] = useSearchParams();
  const { loadState } = useUser();
  const { performance, setPerformanceEntry } = useData();
  const { metrics: allCustom } = useCustomMetrics();
  const nameIdBase = useId();

  const dateParam = searchParams.get("date");
  const requestedOffset = useMemo(() => {
    if (!dateParam) return HISTORY;
    return historyOffsetFromISO(dateParam);
  }, [dateParam]);

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
  const trackedIds =
    profile?.trackedPerformanceMetrics ?? PERFORMANCE_METRICS.map((m) => m.id);

  const entries = performance.status === "loaded" ? performance.entries : [];
  const currentEntry =
    entries.find((e) => e.date === dateIso) ?? emptyPerformanceEntry(dateIso);

  if (shouldRedirect) {
    return <Navigate to="/performance" replace />;
  }

  function setMetricValue(metricId: string, raw: string) {
    if (raw === "") {
      setPerformanceEntry(dateIso, {
        metrics: { [metricId]: undefined },
      });
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;
    setPerformanceEntry(dateIso, { metrics: { [metricId]: numeric } });
  }

  // Include ADDABLE_PERFORMANCE so opt-in metrics resolve here too.
  // PERFORMANCE_METRICS is currently empty (every Perf metric is
  // off by default per the sheet), so all 16 entries flow through
  // the addable side.
  const builtInById = new Map(
    [...PERFORMANCE_METRICS, ...ADDABLE_PERFORMANCE].map((m) => [m.id, m]),
  );
  const customById = new Map<string, (typeof allCustom)[number]>();
  for (const def of allCustom) {
    if (def.metricType === "performance") customById.set(def.id, def);
  }
  const displayedMetrics: Array<{ id: string; name: string }> = [];
  for (const id of trackedIds) {
    const builtIn = builtInById.get(id);
    if (builtIn) {
      displayedMetrics.push(builtIn);
      continue;
    }
    const custom = customById.get(id);
    if (custom) {
      displayedMetrics.push(custom);
    }
  }

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
          <div className={css.profileWelcome}>
            <h2 className={css.profileWelcomeTitle}>Your Performance Log</h2>
            <p>
              Track your performance test results here. Most performance
              metrics are measured periodically (e.g., quarterly); add the
              ones your team measures via the link below.
            </p>
          </div>
        )}

        {displayedMetrics.length === 0 ? (
          <div className={css.emptyState}>
            <p>
              No performance metrics tracked yet.{" "}
              <Link to="/setup/tracking">Add a performance metric</Link>{" "}
              to start logging 1-rep maxes, sprint times, jump heights, and
              more.
            </p>
          </div>
        ) : (
          <table className={css.performanceLogTable}>
            <thead>
              <tr>
                <th scope="col">Latest</th>
                <th scope="col">Metric</th>
                <th scope="col" className={css.colRecord}>
                  Record
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedMetrics.map((metric) => {
                const live = currentEntry.metrics?.[metric.id];
                const stringValue =
                  typeof live === "number" && Number.isFinite(live)
                    ? String(live)
                    : typeof live === "string" && live !== ""
                      ? live
                      : "";
                const filled = stringValue !== "";
                const nameCellId = `${nameIdBase}-${metric.id}`;
                return (
                  <tr key={metric.id}>
                    <td className={css.colTotal}>{filled ? stringValue : ""}</td>
                    <td id={nameCellId} className={css.colMetric}>
                      {/* Per-metric detail page (/performance/:id) is a
                          follow-up; render the name as plain text for
                          now so PerformanceLog ships without a dead
                          link. */}
                      {metric.name}
                    </td>
                    <td className={css.colRecord}>
                      {(() => {
                        const customDef = customById.get(metric.id);
                        if (
                          customDef?.primitive === "ordinal" &&
                          customDef.levels
                        ) {
                          const ordinalValue =
                            typeof live === "number" && Number.isFinite(live)
                              ? live
                              : undefined;
                          return (
                            <OrdinalRadioGroup
                              levels={customDef.levels}
                              value={ordinalValue}
                              onChange={(next) =>
                                setMetricValue(metric.id, String(next))
                              }
                              labelledBy={nameCellId}
                            />
                          );
                        }
                        if (customDef?.primitive === "nominal") return null;
                        return (
                          <CompetitionMetricInput
                            metricId={metric.id}
                            labelledBy={nameCellId}
                            value={stringValue}
                            filled={filled}
                            onChange={(raw) => setMetricValue(metric.id, raw)}
                            allowNegative={
                              (customDef?.yBottomRaw ?? 0) < 0
                            }
                          />
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
