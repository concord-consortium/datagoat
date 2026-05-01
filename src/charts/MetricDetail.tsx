import { useId, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { MetricChart } from "./MetricChart";
import {
  TimeRangePicker,
  TIME_RANGE_DAYS,
  rangeLabel,
  rangeDescriptionPhrase,
  type TimeRangeKey,
} from "../components/dashboard/TimeRangePicker";
import { WELLNESS_METRICS } from "../metrics/wellnessMetrics";
import { PERFORMANCE_METRICS } from "../metrics/performanceMetrics";
import {
  ADDABLE_WELLNESS,
  ADDABLE_PERFORMANCE,
} from "../metrics/addableMetrics";
import type { MetricDefinition } from "../metrics/types";
import { DEFAULT_PROFILE_KEY } from "../data/profileVariants";
import { resolveGoalText } from "../data/metricGoals";
import { useUser } from "../contexts/UserContext";
import {
  useWellnessData,
  usePerformanceData,
} from "../contexts/DataContext";
import {
  buildSeries,
  capitalizeAthleteType,
  capitalizeGender,
  formatNumber,
  lookupGoalLine,
} from "./chartSeries";
import ExternalLinkIcon from "@/icons/external-link.svg?react";
import css from "./MetricDetail.module.css";

interface MetricDetailProps {
  type: "wellness" | "performance";
}

// Hydration color-scale palette + bracket labels (verbatim port of the
// prototype's hydrationHexes + label runs around HTML lines 6724-6739).
// Renders only on the Hydration MetricDetail under "Estimated Range".
const HYDRATION_HEXES = [
  "#F9F7DA",
  "#FFFAC7",
  "#FFF585",
  "#FFF234",
  "#FFEE70",
  "#FFEA41",
  "#DBC37A",
  "#A7944B",
];

// Single-metric deep-dive view. Reuses <MetricChart> (the placeholder from
// Step 14). Adds metric info (Definition / Who Collects It / How Collected
// / Estimated Range / When Collected / References), a Learn-more link, a
// per-profile goal line, and the visually-hidden data table.
//
// Unknown :metricId falls back via <Navigate replace /> to the parent log.
// No dedicated 404 view - bouncing back is the right recovery.
export function MetricDetail({ type }: MetricDetailProps) {
  const { metricId } = useParams<{ metricId: string }>();
  // Tracked + addable registries are both searched so the AddMetric
  // info button (which links into the addable space) doesn't
  // dead-end. Tracked metrics shadow addable ones with the same id.
  const allMetrics =
    type === "wellness"
      ? [...WELLNESS_METRICS, ...ADDABLE_WELLNESS]
      : [...PERFORMANCE_METRICS, ...ADDABLE_PERFORMANCE];
  const metric = allMetrics.find((m) => m.id === metricId);

  const { loadState } = useUser();
  const profile = loadState.status === "loaded" ? loadState.profile : null;
  const profileKey = profile
    ? `${capitalizeGender(profile.gender)}/${capitalizeAthleteType(profile.athleteType)}`
    : DEFAULT_PROFILE_KEY;

  const wellness = useWellnessData();
  const performance = usePerformanceData();
  const dataLoading =
    type === "wellness"
      ? wellness.status === "loading"
      : performance.status === "loading";
  const wellnessEntries =
    wellness.status === "loaded" ? wellness.entries : [];
  const performanceEntries =
    performance.status === "loaded" ? performance.entries : [];

  const [range, setRange] = useState<TimeRangeKey>("7d");

  const series = useMemo(
    () =>
      metric
        ? buildSeries({
            type,
            metricId: metric.id,
            wellnessEntries,
            performanceEntries,
            rangeDays: TIME_RANGE_DAYS[range],
          })
        : [],
    [type, metric, wellnessEntries, performanceEntries, range],
  );

  if (!metric) {
    return (
      <Navigate
        to={type === "wellness" ? "/wellness" : "/performance"}
        replace
      />
    );
  }

  const goalLine =
    type === "wellness" ? lookupGoalLine(metric.id, profileKey) : undefined;
  const average =
    series.length > 0
      ? series.reduce((s, p) => s + p.value, 0) / series.length
      : undefined;

  const description = dataLoading
    ? `${metric.name} chart is loading.`
    : composeDescription(metric, range, goalLine, average);

  // Goal-line text under Estimated Range. Prototype renders only when
  // gender + athleteType are known; React port defers to the profile
  // when loaded, falls back to DEFAULT_PROFILE_KEY otherwise so the
  // sentence still reads (with the fallback profile's mapping).
  const compTermPlural = profile?.competitionTerm
    ? `${profile.competitionTerm}s`
    : "games";
  const goalText = resolveGoalText(metric.id, profileKey, compTermPlural);
  const profileLabel = profile
    ? `${capitalizeGender(profile.gender)} ${capitalizeAthleteType(profile.athleteType)}`
    : "[Gender] [Athlete Type]";
  const article = /^[aeiou]/i.test(profileLabel) ? "an" : "a";

  return (
    <div className={css.detailScreen}>
      <div className={css.chartSection}>
        <div className={css.chartTitle}>Your {metric.name}</div>
        <div className={css.chartDate}>{rangeLabel(range)}</div>
        <MetricChart
          type={chartTypeFor(metric.id)}
          data={dataLoading ? [] : series}
          goalLine={goalLine}
          averageLine={average}
          title={`Your ${metric.name}`}
          description={description}
          dataTableTitle={`${metric.name} data`}
          loading={dataLoading}
        />
        <TimeRangePicker
          value={range}
          onChange={setRange}
          ariaLabel={`${metric.name} time range`}
        />
      </div>
      <div className={css.chartDivider} aria-hidden="true" />

      <h2 className={css.infoSectionHeading}>Definition</h2>
      <div className={css.metricDescription}>
        {renderMultiline(metric.description)}
        {metric.learnMoreUrl && (
          <p className={css.learnMoreWrap}>
            <a
              className={css.learnMore}
              href={metric.learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className={css.linkText}>
                Learn more about {metric.name}{" "}
                <span className={css.linkIconWrap}>
                  <ExternalLinkIcon className={css.linkIcon} />
                </span>
              </span>
            </a>
          </p>
        )}
      </div>

      <h2 className={css.infoSectionHeading}>Who Collects It</h2>
      <div className={css.metricDescription}>
        {renderMultiline(metric.whoCollects)}
      </div>

      <h2 className={css.infoSectionHeading}>How Collected</h2>
      <div className={css.metricDescription}>
        {renderMultiline(metric.howCollected)}
      </div>

      <h2 className={css.infoSectionHeading}>Estimated Range</h2>
      <div className={css.metricDescription}>
        {metric.estimatedRange ??
          (metric.min !== undefined && metric.max !== undefined
            ? `${metric.min}–${metric.max}${metric.unit ? ` ${metric.unit}` : ""}`
            : metric.unit || "—")}
        {metric.id === "hydration" && <HydrationColorScale />}
        {goalText && (
          <p className={css.goalLine}>
            <GoalDot />
            As {article} {profileLabel} athlete, your goal is {goalText}.
          </p>
        )}
      </div>

      {metric.whenCollected && (
        <>
          <h2 className={css.infoSectionHeading}>
            When / How Many Times Collected
          </h2>
          <div className={css.metricDescription}>{metric.whenCollected}</div>
        </>
      )}

      {metric.references && metric.references.length > 0 && (
        <>
          <h2 className={css.infoSectionHeading}>
            {metric.references.length > 1 ? "References" : "Reference"}
          </h2>
          <div className={css.metricDescription}>
            {metric.references.map((ref) => (
              <p key={ref.url} className={css.referenceLinkWrap}>
                <a
                  className={`${css.learnMore} ${css.referenceLink}`}
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className={css.linkText}>
                    {ref.title}{" "}
                    <span className={css.linkIconWrap}>
                      <ExternalLinkIcon className={css.linkIcon} />
                    </span>
                  </span>
                </a>
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Hydration color-scale-static swatch grid (prototype HTML 6724-6739).
// Three labeled brackets above the row of 8 numbered swatches:
// 1-3 Hydrated / 4-6 Mildly to moderately dehydrated / 7-8 Dehydrated.
function HydrationColorScale() {
  const hydratedId = useId();
  const mildId = useId();
  const dehydratedId = useId();
  const segments = [
    {
      id: hydratedId,
      label: "Hydrated",
      column: "1 / span 3",
      labelClass: css.scaleLabel,
      start: 0,
      end: 3,
    },
    {
      id: mildId,
      label: "Mildly to moderately dehydrated",
      column: "4 / span 3",
      labelClass: css.scaleLabel,
      start: 3,
      end: 6,
    },
    {
      id: dehydratedId,
      label: "Dehydrated",
      column: "7 / span 2",
      labelClass: `${css.scaleLabel} ${css.scaleLabelNoWrap}`,
      start: 6,
      end: 8,
    },
  ];
  return (
    <div
      className={css.colorScaleStatic}
      role="group"
      aria-label="Hydration color scale"
    >
      {segments.map(({ id, label, column, labelClass, start, end }) => (
        <div
          key={id}
          role="group"
          aria-labelledby={id}
          style={{ display: "contents" }}
        >
          <div
            id={id}
            className={labelClass}
            style={{ gridColumn: column, gridRow: 1 }}
          >
            {label}
          </div>
          <div
            className={css.scaleBracket}
            style={{ gridColumn: column, gridRow: 2 }}
            aria-hidden="true"
          />
          {HYDRATION_HEXES.slice(start, end).map((hex, i) => (
            <div
              key={hex}
              className={css.colorSwatch}
              style={{ background: hex, gridColumn: start + i + 1, gridRow: 3 }}
            >
              {start + i + 1}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Goal-line target dot (prototype's small SVG composed inline in
// showMetricDetail at line 6720). Filled center with a stroked outer
// ring; uses var(--text) so it inherits theme color.
function GoalDot() {
  return (
    <svg
      className={css.goalDot}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Long-form description strings ported from the prototype use "\n" line
// breaks. Render them as paragraphs so the screen reads correctly without
// requiring callers to switch to actual <br/> markup in the registry.
function renderMultiline(text: string) {
  if (!text) return <em className={css.placeholder}>Coming soon</em>;
  const parts = text.split("\n");
  return parts.map((p, i) => (
    <p key={i} className={i === 0 ? css.firstPara : undefined}>
      {p}
    </p>
  ));
}

function composeDescription(
  metric: MetricDefinition,
  range: TimeRangeKey,
  goalLine: number | undefined,
  average: number | undefined,
): string {
  return [
    `${metric.name} ${rangeDescriptionPhrase(range)}.`,
    goalLine !== undefined
      ? `Goal: ${formatNumber(goalLine)}${metric.unit ? ` ${metric.unit}` : ""}.`
      : null,
    average !== undefined
      ? `Recent average: ${formatNumber(average)}${metric.unit ? ` ${metric.unit}` : ""}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

// Per-metric chart type. The prototype renders Sleep Time + Protein as
// bars (daily totals stack-style); other wellness metrics + performance
// metrics render as lines. The placeholder doesn't draw differently per
// type, but the prop is forwarded so the future real-chart PR picks the
// correct primitive.
function chartTypeFor(metricId: string): "line" | "bar" {
  return metricId === "sleepTime" || metricId === "protein" ? "bar" : "line";
}
