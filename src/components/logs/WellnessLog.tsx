import { useMemo } from "react";
import {
  Navigate,
  useSearchParams,
} from "react-router-dom";
import { DateNav } from "../layout/DateNav";
import { MetricInputRow } from "./MetricInputRow";
import { useUser } from "../../contexts/UserContext";
import { useData } from "../../contexts/DataContext";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import { WELLNESS_METRICS } from "../../metrics/wellnessMetrics";
import type { MetricDefinition } from "../../metrics/types";
import type { CustomMetricDef } from "../../types/customMetrics";
import {
  HISTORY,
  dateAtOffset,
  historyOffsetFromISO,
  toISO,
} from "../../utils/dates";
import { getChipState } from "../../utils/wellnessCompleteness";
import { emptyWellnessEntry, type WellnessEntry } from "../../types/data";
import css from "./WellnessLog.module.css";

export function WellnessLog() {
  const [searchParams] = useSearchParams();
  const { loadState } = useUser();
  const { wellness, setWellnessEntry } = useData();
  const { metrics: allCustom } = useCustomMetrics();

  const dateParam = searchParams.get("date");
  const requestedOffset = useMemo(() => {
    if (!dateParam) return HISTORY;
    return historyOffsetFromISO(dateParam);
  }, [dateParam]);

  // Malformed or out-of-range ?date= triggers a fallback Navigate. Compute
  // the redirect flag here so all hooks below run unconditionally - returning
  // <Navigate /> before useRef would change the hook count between renders.
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

  const profile =
    loadState.status === "loaded" ? loadState.profile : null;
  const competitionTerm = profile?.competitionTerm ?? "game";
  const trackedIds =
    profile?.trackedWellnessMetrics ?? WELLNESS_METRICS.map((m) => m.id);

  const entries =
    wellness.status === "loaded" ? wellness.entries : [];
  // Merge over emptyWellnessEntry defaults so partially-saved docs
  // (e.g. saved before a metric was tracked) still expose every field
  // the UI reads. Without this, toggling availability on after logging
  // other metrics hands AvailabilityTree an undefined value and crashes.
  const foundEntry = entries.find((e) => e.date === dateIso);
  const currentEntry: WellnessEntry = foundEntry
    ? { ...emptyWellnessEntry(dateIso), ...foundEntry }
    : emptyWellnessEntry(dateIso);

  const chipState = getChipState(currentEntry, trackedIds);

  if (shouldRedirect) {
    return <Navigate to="/wellness" replace />;
  }

  function setNumericField<K extends keyof WellnessEntry>(
    field: K,
    raw: string,
  ) {
    const numeric = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(numeric)) return;
    setWellnessEntry(dateIso, { [field]: numeric } as Partial<WellnessEntry>);
  }

  function setHydration(level: number) {
    setWellnessEntry(dateIso, { hydration: level });
  }

  function setAvailability(next: WellnessEntry["availability"]) {
    setWellnessEntry(dateIso, { availability: next });
  }

  function setCustomMetric(metricId: string, raw: string) {
    const numeric = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(numeric)) return;
    setWellnessEntry(dateIso, { customMetrics: { [metricId]: numeric } });
  }

  // Custom wellness metrics bypass the tracked-IDs filter (DGT-36 demo
  // decision: no per-custom checkbox). Adapter shapes them to the
  // MetricDefinition contract MetricInputRow expects.
  const customWellness = allCustom.filter((m) => m.metricType === "wellness");
  const adaptCustom = (def: CustomMetricDef): MetricDefinition => ({
    id: def.id,
    name: def.name,
    unit: def.unit,
    displayUnit: def.unit,
    type: "wellness",
    whoCollects: "",
    howCollected: "",
    description: "",
    inputType: "numeric",
  });

  // Welcome paragraph is shown only during onboarding (matches the
  // prototype's `.profile-welcome.show` gate keyed on `window.isNewUser`
  // - HTML around line 5088). Established users with a complete profile
  // see only the data-entry table.
  const isOnboarding =
    loadState.status === "missing" ||
    (loadState.status === "loaded" &&
      (!loadState.profile.profileComplete ||
        !loadState.profile.trackingSetupComplete));

  return (
    <>
      <DateNav offset={offset} withChip chipState={chipState} />
      <div className={css.screenContent}>
        {isOnboarding && (
          <div className={css.profileWelcome}>
            <h2 className={css.profileWelcomeTitle}>
              Your Health & Wellness Log
            </h2>
            <p>
              Record your health & wellness metrics here. Logging consistently
              - even on rest days - helps you and your team spot patterns
              over time.
            </p>
          </div>
        )}

        <table className={css.bodyTable}>
          <thead>
            <tr>
              <th>
                <span className={css.trackLabel}>Avg</span>
              </th>
              <th>Metric</th>
              <th>
                <div className={css.recordHeaderLabel}>Record</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {WELLNESS_METRICS.filter((m) => trackedIds.includes(m.id)).map(
              (metric) => {
                if (metric.id === "hydration") {
                  return (
                    <MetricInputRow
                      key={metric.id}
                      metric={metric}
                      inputType="colorScale"
                      value={currentEntry.hydration}
                      onChange={setHydration}
                      detailHref={`/wellness/${metric.id}`}
                    />
                  );
                }
                if (metric.id === "availability") {
                  return (
                    <MetricInputRow
                      key={metric.id}
                      metric={metric}
                      inputType="tree"
                      competitionTerm={competitionTerm}
                      value={currentEntry.availability}
                      onChange={setAvailability}
                      detailHref={`/wellness/${metric.id}`}
                    />
                  );
                }
                const fieldKey = metric.id as keyof Pick<
                  WellnessEntry,
                  "sleepTime" | "sleepEfficiency" | "protein" | "leanMass"
                >;
                const live = currentEntry[fieldKey];
                const stringValue =
                  typeof live === "number" && live > 0 ? String(live) : "";
                return (
                  <MetricInputRow
                    key={metric.id}
                    metric={metric}
                    inputType="numeric"
                    value={stringValue}
                    onChange={(raw) => setNumericField(fieldKey, raw)}
                    detailHref={`/wellness/${metric.id}`}
                  />
                );
              },
            )}
            {customWellness.map((def) => {
              const live = currentEntry.customMetrics?.[def.id];
              // !== 0 (rather than > 0) so custom metrics with a
              // negative yBottomRaw can render legitimate negative
              // values. 0 stays the "blank input" sentinel since 0 is
              // what the writer stores for an empty entry.
              const stringValue =
                typeof live === "number" && live !== 0
                  ? String(live)
                  : typeof live === "string"
                    ? live
                    : "";
              return (
                <MetricInputRow
                  key={def.id}
                  metric={adaptCustom(def)}
                  inputType="numeric"
                  value={stringValue}
                  onChange={(raw) => setCustomMetric(def.id, raw)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
