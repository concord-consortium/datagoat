import { useEffect, useMemo, useRef } from "react";
import {
  Navigate,
  useSearchParams,
} from "react-router-dom";
import { DateNav } from "../layout/DateNav";
import { MetricInputRow } from "./MetricInputRow";
import { useUser } from "../../contexts/UserContext";
import { useData } from "../../contexts/DataContext";
import { WELLNESS_METRICS } from "../../metrics/wellnessMetrics";
import {
  HISTORY,
  dateAtOffset,
  dateOffsetFromISO,
  toISO,
} from "../../utils/dates";
import { getChipState } from "../../utils/wellnessCompleteness";
import type { WellnessEntry } from "../../types/data";
import css from "./WellnessLog.module.css";

const DEBOUNCE_MS = 500;

const EMPTY_AVAILABILITY: WellnessEntry["availability"] = {
  practiceHeld: null,
  practiceParticipation: null,
  gameHeld: null,
  gameParticipation: null,
};

function emptyEntry(date: string): WellnessEntry {
  return {
    version: 1,
    date,
    hydration: 0,
    sleepTime: 0,
    sleepEfficiency: 0,
    protein: 0,
    leanMass: 0,
    availability: EMPTY_AVAILABILITY,
  };
}

export function WellnessLog() {
  const [searchParams] = useSearchParams();
  const { loadState } = useUser();
  const { wellness, setWellnessEntry } = useData();

  const dateParam = searchParams.get("date");
  const requestedOffset = useMemo(() => {
    if (!dateParam) return HISTORY;
    return dateOffsetFromISO(dateParam);
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
  // Merge over emptyEntry defaults so partially-saved docs (e.g. saved
  // before a metric was tracked) still expose every field the UI reads.
  // Without this, toggling availability on after logging other metrics
  // hands AvailabilityTree an undefined value and crashes the page.
  const foundEntry = entries.find((e) => e.date === dateIso);
  const currentEntry: WellnessEntry = foundEntry
    ? { ...emptyEntry(dateIso), ...foundEntry }
    : emptyEntry(dateIso);

  // Debounced writes via accumulator pattern. Merge incoming partials into
  // a ref keyed by date; flush on a single timer. Required so typing across
  // multiple fields within DEBOUNCE_MS doesn't lose the earlier-typed
  // fields - a naive single-timer-with-latest-arg debounce would clobber.
  // Per spec "Step 11 - debounce accumulator".
  const pendingRef = useRef<{
    date: string | null;
    partial: Partial<WellnessEntry>;
  }>({ date: null, partial: {} });
  const timerRef = useRef<number | null>(null);

  const flushPending = () => {
    const { date, partial } = pendingRef.current;
    // Object.keys check is load-bearing under Strict Mode's mount->unmount
    // ->remount cycle - without it, the first cleanup fires a no-op write
    // of an empty object.
    if (date && Object.keys(partial).length > 0) {
      void setWellnessEntry(date, partial);
    }
    pendingRef.current = { date: null, partial: {} };
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const queueWrite = (date: string, partial: Partial<WellnessEntry>) => {
    // If the user just navigated to a different date, flush the prior
    // date's pending writes before starting a new accumulator for the
    // new date - so the last keystroke on the prior date isn't lost.
    if (
      pendingRef.current.date !== null &&
      pendingRef.current.date !== date
    ) {
      flushPending();
    }
    pendingRef.current = {
      date,
      partial: { ...pendingRef.current.partial, ...partial },
    };
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      flushPending();
    }, DEBOUNCE_MS);
  };

  // Flush pending writes on date change, before the new date's data
  // takes over.
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
    queueWrite(dateIso, { [field]: numeric } as Partial<WellnessEntry>);
  }

  function setHydration(level: number) {
    queueWrite(dateIso, { hydration: level });
  }

  function setAvailability(next: WellnessEntry["availability"]) {
    queueWrite(dateIso, { availability: next });
  }

  // Live-display values pull from the entry, with a write-through overlay
  // from the pending accumulator so the user sees their just-typed value
  // immediately even though the Firestore commit is debounced.
  function liveValue<K extends keyof WellnessEntry>(
    field: K,
  ): WellnessEntry[K] {
    const pending = pendingRef.current.partial as Partial<WellnessEntry>;
    if (
      pendingRef.current.date === dateIso &&
      Object.prototype.hasOwnProperty.call(pending, field)
    ) {
      return pending[field] as WellnessEntry[K];
    }
    return currentEntry[field];
  }

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
          <p className={css.profileWelcome}>
            <strong className={css.profileWelcomeTitle}>
              Your Health & Wellness Log
            </strong>
            Record your health & wellness metrics here. Logging consistently
            - even on rest days - helps you and your team spot patterns
            over time.
          </p>
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
                      value={liveValue("hydration") as number}
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
                      value={
                        liveValue(
                          "availability",
                        ) as WellnessEntry["availability"]
                      }
                      onChange={setAvailability}
                      detailHref={`/wellness/${metric.id}`}
                    />
                  );
                }
                const fieldKey = metric.id as keyof Pick<
                  WellnessEntry,
                  "sleepTime" | "sleepEfficiency" | "protein" | "leanMass"
                >;
                const live = liveValue(fieldKey);
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
          </tbody>
        </table>
      </div>
    </>
  );
}
