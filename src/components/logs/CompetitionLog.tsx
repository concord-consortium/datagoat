import { useId, useMemo } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { DateNav } from "../layout/DateNav";
import { useUser } from "../../contexts/UserContext";
import { useData } from "../../contexts/DataContext";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import { COMPETITION_METRICS } from "../../metrics/competitionMetrics";
import {
  HISTORY,
  dateAtOffset,
  historyOffsetFromISO,
  toISO,
} from "../../utils/dates";
import { competitionTotal } from "./CompetitionTotals";
import { emptyCompetitionEntry } from "../../types/data";
import { CompetitionMetricInput } from "./CompetitionMetricInput";
import { hasEntriesForMetric } from "../../utils/customMetricEntries";
import css from "./CompetitionLog.module.css";

export function CompetitionLog() {
  const [searchParams] = useSearchParams();
  const { loadState } = useUser();
  const { competition, setCompetitionEntry } = useData();
  const { metrics: allCustom } = useCustomMetrics();
  const nameIdBase = useId();

  const dateParam = searchParams.get("date");
  const requestedOffset = useMemo(() => {
    if (!dateParam) return HISTORY;
    return historyOffsetFromISO(dateParam);
  }, [dateParam]);

  // Malformed or out-of-range ?date= triggers a fallback Navigate. Same
  // hook-order safety as HealthLog: compute the redirect flag so all
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
    profile?.trackedCompetitionMetrics ?? COMPETITION_METRICS.map((m) => m.id);

  const entries = competition.status === "loaded" ? competition.entries : [];
  const currentEntry =
    entries.find((e) => e.date === dateIso) ?? emptyCompetitionEntry(dateIso);

  if (shouldRedirect) {
    return <Navigate to="/competition" replace />;
  }

  function setMetricValue(metricId: string, raw: string) {
    const numeric = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(numeric)) return;
    setCompetitionEntry(dateIso, { metrics: { [metricId]: numeric } });
  }

  // Both built-ins and customs respect the user's tracked-IDs
  // preference. The user can drag-reorder a custom metric among
  // built-ins on /setup/tracking; iterating trackedIds (rather than
  // appending customs after built-ins) honors that ordering here.
  const builtInById = new Map(COMPETITION_METRICS.map((m) => [m.id, m]));
  const customById = new Map<string, (typeof allCustom)[number]>();
  for (const def of allCustom) {
    if (def.metricType === "competition") customById.set(def.id, def);
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
    // Stale id that resolves to neither — silently skip.
  }
  // Set of metric ids whose y-range goes below 0 — used to open the
  // numeric input filter to a leading `-`. Built-in competition
  // metrics are all non-negative, so this set only contains customs
  // whose author chose `yBottomRaw < 0`.
  const allowNegativeIds = new Set(
    Array.from(customById.values())
      .filter((m) => m.yBottomRaw < 0)
      .map((m) => m.id),
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
          <div className={css.profileWelcome}>
            <h2 className={css.profileWelcomeTitle}>Your Competition Log</h2>
            <p>
              Track your competition data here. Log your numbers after each
              competition to build a complete picture of your progress.
            </p>
          </div>
        )}

        <table className={css.competitionLogTable}>
          <thead>
            <tr>
              <th scope="col">Total</th>
              <th scope="col">Metric</th>
              <th scope="col" className={css.colRecord}>
                Record
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedMetrics.map((metric) => {
              const live = currentEntry.metrics?.[metric.id];
              // stringValue renders the input control. A stored 0 is
              // valid logged data and must show as "0". A missing key
              // (undefined) is "not logged" and renders as blank.
              const stringValue =
                typeof live === "number" && Number.isFinite(live)
                  ? String(live)
                  : typeof live === "string" && live !== ""
                    ? live
                    : "";
              const filled = stringValue !== "";
              const total = competitionTotal(entries, metric.id);
              const nameCellId = `${nameIdBase}-${metric.id}`;
              return (
                <tr key={metric.id}>
                  <td className={css.colTotal}>
                    {/* competitionTotal returns 0 both for "no entries"
                        and for "entries summing to 0" - use
                        hasEntriesForMetric to render the cell only when
                        there's real data, so a legit 0-total shows as
                        "0" and an empty cell stays blank. */}
                    {hasEntriesForMetric(metric.id, [], entries)
                      ? String(total)
                      : ""}
                  </td>
                  <td id={nameCellId} className={css.colMetric}>
                    <Link
                      to={`/competition/${metric.id}`}
                      className={css.metricLink}
                    >
                      {metric.name}
                    </Link>
                  </td>
                  <td className={css.colRecord}>
                    <CompetitionMetricInput
                      metricId={metric.id}
                      labelledBy={nameCellId}
                      value={stringValue}
                      filled={filled}
                      onChange={(raw) => setMetricValue(metric.id, raw)}
                      allowNegative={allowNegativeIds.has(metric.id)}
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

