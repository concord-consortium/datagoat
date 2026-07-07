import { useMemo } from "react";
import {
  Link,
  Navigate,
  useSearchParams,
} from "react-router-dom";
import { DateNav } from "../layout/DateNav";
import { MetricInputRow } from "./MetricInputRow";
import rowCss from "./MetricInputRow.module.css";
import { useUser } from "../../contexts/UserContext";
import { useData } from "../../contexts/DataContext";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { ADDABLE_HEALTH } from "../../metrics/addableMetrics";
import type { MetricDefinition } from "../../metrics/types";
import type { CustomMetricDef } from "../../types/customMetrics";
import {
  HISTORY,
  dateAtOffset,
  historyOffsetFromISO,
  toISO,
} from "../../utils/dates";
import { getChipState } from "../../utils/healthCompleteness";
import { emptyHealthEntry, type HealthEntry } from "../../types/data";
import css from "./HealthLog.module.css";

// All built-in health metric definitions (default-on + addable),
// indexed by id. Hoisted to module scope so the lookup map is
// constant across renders without needing a hook — the component
// early-returns on bad ?date= params, and a useMemo declared after
// that return would violate the Rules of Hooks.
//
// Including ADDABLE_HEALTH here means a user who opts into an
// addable (e.g., Pain) via TrackedDataSetup can resolve its
// MetricDefinition for rendering. Default-on vs default-off is a
// property of the tracked-id list (HEALTH_METRICS by default), not
// the lookup map.
const BUILT_IN_BY_ID = new Map<string, MetricDefinition>(
  [...HEALTH_METRICS, ...ADDABLE_HEALTH].map((m) => [m.id, m]),
);

export function HealthLog() {
  const [searchParams] = useSearchParams();
  const { loadState } = useUser();
  const { health, setHealthEntry } = useData();
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
    profile?.trackedHealthMetrics ?? HEALTH_METRICS.map((m) => m.id);

  const entries =
    health.status === "loaded" ? health.entries : [];
  // Merge over emptyHealthEntry defaults so partially-saved docs
  // (e.g. saved before a metric was tracked) still expose every field
  // the UI reads. Without this, toggling availability on after logging
  // other metrics hands AvailabilityTree an undefined value and crashes.
  const foundEntry = entries.find((e) => e.date === dateIso);
  const currentEntry: HealthEntry = foundEntry
    ? { ...emptyHealthEntry(dateIso), ...foundEntry }
    : emptyHealthEntry(dateIso);

  const chipState = getChipState(currentEntry, trackedIds);

  if (shouldRedirect) {
    return <Navigate to="/health" replace />;
  }

  function setNumericField<K extends keyof HealthEntry>(
    field: K,
    raw: string,
  ) {
    if (raw === "") {
      setHealthEntry(dateIso, { [field]: undefined } as Partial<HealthEntry>);
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;
    setHealthEntry(dateIso, { [field]: numeric } as Partial<HealthEntry>);
  }

  function setHydration(level: number) {
    setHealthEntry(dateIso, { hydration: level });
  }

  function setAvailability(next: HealthEntry["availability"]) {
    setHealthEntry(dateIso, { availability: next });
  }

  function setCustomMetric(metricId: string, raw: string) {
    if (raw === "") {
      setHealthEntry(dateIso, {
        customMetrics: { [metricId]: undefined },
      });
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return;
    setHealthEntry(dateIso, { customMetrics: { [metricId]: numeric } });
  }

  // Custom health metrics indexed by id. Built-in lookup uses the
  // module-scope BUILT_IN_BY_ID; both feed the unified iteration in
  // the JSX below, which walks `trackedIds` and dispatches to
  // whichever map carries the id. Iterating trackedIds (rather than
  // separate registry-order maps) is what honors the user's
  // drag-reorder choices on /setup/tracking — a custom dragged among
  // built-ins ends up in the right slot here.
  const customById = new Map<string, CustomMetricDef>();
  for (const def of allCustom) {
    if (def.metricType === "health") customById.set(def.id, def);
  }
  const adaptCustom = (def: CustomMetricDef): MetricDefinition => ({
    id: def.id,
    name: def.name,
    unit: def.unit ?? "",
    displayUnit: def.unit ?? "",
    type: "health",
    whoCollects: "",
    howCollected: "",
    description: "",
    inputType: "numeric",
    timePrecision: def.timePrecision,
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
              Your Health Log
            </h2>
            <p>
              Record your health metrics here. Logging consistently — even
              on rest days — helps you and your team spot patterns over time.
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
            {trackedIds.map((id) => {
              const builtIn = BUILT_IN_BY_ID.get(id);
              if (builtIn) {
                if (id === "hydration") {
                  return (
                    <MetricInputRow
                      key={id}
                      metric={builtIn}
                      inputType="colorScale"
                      // Hydration is optional (undefined = not entered). The
                      // ColorScale component renders "no selection" when value
                      // is 0 or undefined, preserving the undefined semantics
                      // throughout the data flow.
                      value={currentEntry.hydration}
                      onChange={setHydration}
                      detailHref={`/health/${id}`}
                    />
                  );
                }
                if (id === "availability") {
                  return (
                    <MetricInputRow
                      key={id}
                      metric={builtIn}
                      inputType="tree"
                      competitionTerm={competitionTerm}
                      value={currentEntry.availability}
                      onChange={setAvailability}
                      detailHref={`/health/${id}`}
                    />
                  );
                }
                if (id === "relativeProteinIntake") {
                  // Auto-calculated metric per the DGT-51 design source.
                  // The derivation (protein / leanMass with profile
                  // weighting) is a follow-up; for now the row shows a
                  // placeholder so the metric is visible without
                  // pretending it has an input control.
                  return (
                    <tr key={id} className={rowCss.metricInputRow}>
                      <td>
                        <div className={rowCss.trackCell}>—</div>
                      </td>
                      <td className={rowCss.metricName}>
                        <Link
                          to={`/health/${id}`}
                          className={rowCss.metricLink}
                        >
                          {builtIn.name}
                        </Link>
                      </td>
                      <td>
                        <span className={rowCss.placeholderCell}>
                          🚧 Auto-calculated · coming soon
                        </span>
                      </td>
                    </tr>
                  );
                }
                // Numeric named-field built-ins. Original five metrics
                // store values as typed fields on HealthEntry; the chart
                // engine's readHealthMetric has matching `case` branches.
                if (
                  id === "sleepTime" ||
                  id === "sleepEfficiency" ||
                  id === "protein" ||
                  id === "leanMass"
                ) {
                  const fieldKey = id as keyof Pick<
                    HealthEntry,
                    "sleepTime" | "sleepEfficiency" | "protein" | "leanMass"
                  >;
                  const live = currentEntry[fieldKey];
                  const stringValue =
                    typeof live === "number" && Number.isFinite(live)
                      ? String(live)
                      : "";
                  return (
                    <MetricInputRow
                      key={id}
                      metric={builtIn}
                      inputType="numeric"
                      value={stringValue}
                      onChange={(raw) => setNumericField(fieldKey, raw)}
                      detailHref={`/health/${id}`}
                    />
                  );
                }
                // Generic built-in path for new metrics (Mood, plus
                // off-by-default additions). Values live in the
                // `customMetrics` map (misleading name kept until a
                // follow-up renames the field to `metrics`). Dispatches
                // on the registry's `inputType` so adding another
                // ordinal/numeric built-in needs only a HEALTH_METRICS
                // entry — no new branches here, no `case` in
                // readHealthMetric (its default case reads
                // customMetrics).
                if (builtIn.inputType === "ordinal" && builtIn.levels) {
                  const live = currentEntry.customMetrics?.[id];
                  const ordinalValue =
                    typeof live === "number" && Number.isFinite(live)
                      ? live
                      : undefined;
                  return (
                    <MetricInputRow
                      key={id}
                      metric={builtIn}
                      inputType="ordinal"
                      levels={builtIn.levels}
                      value={ordinalValue}
                      onChange={(next) =>
                        setCustomMetric(id, String(next))
                      }
                      detailHref={`/health/${id}`}
                    />
                  );
                }
                // Numeric fall-through for new built-ins that aren't
                // named-field, aren't ordinal, and aren't one of the
                // special inputType cases above.
                const live = currentEntry.customMetrics?.[id];
                const stringValue =
                  typeof live === "number" && Number.isFinite(live)
                    ? String(live)
                    : "";
                return (
                  <MetricInputRow
                    key={id}
                    metric={builtIn}
                    inputType="numeric"
                    value={stringValue}
                    onChange={(raw) => setCustomMetric(id, raw)}
                    detailHref={`/health/${id}`}
                  />
                );
              }
              const def = customById.get(id);
              if (def) {
                if (def.primitive === "ordinal" && def.levels) {
                  const live = currentEntry.customMetrics?.[id];
                  const ordinalValue =
                    typeof live === "number" && Number.isFinite(live)
                      ? live
                      : undefined;
                  return (
                    <MetricInputRow
                      key={id}
                      inputType="ordinal"
                      metric={adaptCustom(def)}
                      levels={def.levels}
                      value={ordinalValue}
                      onChange={(next) => {
                        setCustomMetric(id, String(next));
                      }}
                      detailHref={`/health/${id}`}
                    />
                  );
                }
                // Nominal customs are schema-reserved but not yet
                // exposed in the form. If a doc with primitive
                // "nominal" surfaces (externally written), don't fall
                // through to the numeric input - that would let users
                // log a number against a label-valued metric and
                // corrupt the entry shape. Skip the row.
                if (def.primitive === "nominal") return null;
                const live = currentEntry.customMetrics?.[id];
                // Finite numbers (incl. 0 and negatives for customs
                // with yBottomRaw < 0) render verbatim. A missing key
                // (undefined) is "not logged" and renders as blank.
                const stringValue =
                  typeof live === "number" && Number.isFinite(live)
                    ? String(live)
                    : typeof live === "string"
                      ? live
                      : "";
                return (
                  <MetricInputRow
                    key={id}
                    metric={adaptCustom(def)}
                    inputType="numeric"
                    value={stringValue}
                    onChange={(raw) => setCustomMetric(id, raw)}
                    detailHref={`/health/${id}`}
                    // Open the keystroke filter to a leading `-`
                    // only when the metric's range goes below 0;
                    // otherwise typing minus stays blocked, matching
                    // built-in behavior.
                    allowNegative={(def.yBottomRaw ?? 0) < 0}
                  />
                );
              }
              // Tracked id resolves to neither a built-in nor a
              // current custom — could be a stale id from a deleted
              // custom that hasn't yet been pruned from
              // trackedHealthMetrics. Skip silently.
              return null;
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
