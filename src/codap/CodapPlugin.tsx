import { useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useDemoMode } from "../contexts/DemoModeContext";
import { useUser } from "../contexts/UserContext";
import {
  useCompetitionData,
  useHealthData,
  usePerformanceData,
} from "../contexts/DataContext";
import { useCustomMetrics } from "../contexts/CustomMetricsContext";
import {
  ADDABLE_COMPETITION,
  ADDABLE_HEALTH,
  ADDABLE_PERFORMANCE,
} from "../metrics/addableMetrics";
import { COMPETITION_METRICS } from "../metrics/competitionMetrics";
import { HEALTH_METRICS } from "../metrics/healthMetrics";
import { PERFORMANCE_METRICS } from "../metrics/performanceMetrics";
import type { MetricDefinition } from "../metrics/types";
import type {
  CompetitionEntry,
  HealthEntry,
  PerformanceEntry,
} from "../types/data";
import type { CustomMetricDef } from "../types/customMetrics";
import { logError } from "../utils/logError";
import { useCodapApi } from "./codapApi";
import {
  buildDataset,
  resolveTrackedMetrics,
  type RawValue,
} from "./codapExport";
import {
  generateDemoCompetitionEntries,
  generateDemoHealthEntries,
  generateDemoPerformanceEntries,
} from "./demoEntries";
import { CodapPluginSignIn } from "./CodapPluginSignIn";
import buttons from "../components/form/buttons.module.css";
import css from "./CodapPlugin.module.css";

// CODAP plugin view. Reads useAuth() directly (not wrapped in
// <ProtectedRoute> per spec). Auth state lives in the iframe's
// partitioned IndexedDB - storage partitioning means the iframe can't
// see the top-level datagoat.concord.org tab's session, so the plugin
// runs its own signInWithPopup flow via <CodapPluginSignIn>.
//
// This is the LAZY-LOADED component (the only lazy-load seam in the
// conversion per resolved Lazy-loading interview question). Importing
// CodapPlugin from AppRoutes via React.lazy keeps the codap-plugin-api
// library out of the initial bundle for the 99% of users who never
// visit /codap.
export default function CodapPlugin() {
  // Both hooks run unconditionally before any branch so hook order stays
  // stable across renders. This repo has no react-hooks lint to catch a
  // conditional-hook regression, so keep both calls here even though only
  // one of demo / auth is used per branch.
  const demoMode = useDemoMode();
  const { user, loading, isEmailVerifiedOrTrusted } = useAuth();

  // Demo mode short-circuits before every auth / profile gate. This is safe
  // because CodapPluginDemo reads no Firestore and shows only generated
  // data - there is no private data behind this branch to protect. Do not
  // add a real data read here, and do not move this check below the gates.
  if (demoMode) {
    return <CodapPluginDemo />;
  }

  if (loading) {
    return (
      <div className={css.pluginShell}>
        <p className={css.statusText} role="status">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <CodapPluginSignIn />;
  }

  if (!isEmailVerifiedOrTrusted) {
    return <CodapPluginUnverified />;
  }

  return <CodapPluginAuthed />;
}

function PluginSignOutBar() {
  const { user, signOut } = useAuth();
  return (
    <div className={css.signOutBar}>
      {user?.email && (
        <span className={css.signedInAs}>
          Signed in as <strong>{user.email}</strong>
        </span>
      )}
      <button
        type="button"
        className={css.signOutBtn}
        onClick={() => void signOut()}
      >
        Sign out
      </button>
    </div>
  );
}

// The verified-or-trusted-provider gate here is UI-only: a revived IDB
// session that doesn't pass isEmailVerifiedOrTrustedProvider renders this
// branch without auto-revoking, and the user signs out via
// PluginSignOutBar. The actual security boundary is the per-user
// Firestore rule (request.auth.uid == userId), which does not gate on
// email_verified per spec. Don't add hooks that consume useUser() in
// this branch - that would leak unverified-user data into components
// that aren't supposed to see it.
function CodapPluginUnverified() {
  return (
    <div className={css.pluginShell}>
      <PluginSignOutBar />
      <h1 className={css.heading}>DataGOAT in CODAP</h1>
      <p className={css.signInNotice} role="status">
        Please verify your email at{" "}
        <a
          href={`${window.location.origin}/verify-email`}
          target="_blank"
          rel="noopener noreferrer"
        >
          datagoat.concord.org
        </a>
        , then reload this plugin.
      </p>
    </div>
  );
}

// Profile-load-error surface for the plugin. /codap is outside
// ProtectedRoute so the top-level <ProfileLoadError> never renders
// here; we render an in-shell variant matching CodapPluginUnverified's
// shape (PluginSignOutBar + heading + status copy + retry CTA). Copy
// is reused from ProfileLoadError so wording stays consistent.
function CodapPluginProfileError({
  kind,
  onRetry,
}: {
  kind: "migration" | "subscription";
  onRetry: () => void;
}) {
  const body =
    kind === "migration"
      ? "There's a problem with your saved profile data. If retrying doesn't help, please contact support."
      : "Check your connection and try again. Your data is safe.";
  return (
    <div className={css.pluginShell}>
      <PluginSignOutBar />
      <h1 className={css.heading}>DataGOAT in CODAP</h1>
      <p className={css.signInNotice} role="alert" aria-live="assertive">
        Couldn&rsquo;t load your profile. {body}
      </p>
      <button
        type="button"
        className={buttons.ctaBtnSecondary}
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}

// "No usable profile" surface for the plugin: the user has no
// Firestore profile doc, or one without profileComplete=true. We
// can't redirect to /profile from inside the iframe, so direct the
// user to the top-level site and reload.
function CodapPluginNoProfile() {
  return (
    <div className={css.pluginShell}>
      <PluginSignOutBar />
      <h1 className={css.heading}>DataGOAT in CODAP</h1>
      <p className={css.signInNotice} role="status">
        Please complete your profile at{" "}
        <a
          href={`${window.location.origin}/profile`}
          target="_blank"
          rel="noopener noreferrer"
        >
          datagoat.concord.org
        </a>
        , then reload this plugin.
      </p>
    </div>
  );
}

function CodapPluginAuthed() {
  const { loadState, retry } = useUser();
  const health = useHealthData();
  const performance = usePerformanceData();
  const competition = useCompetitionData();
  const { metrics: customMetrics, loading: customMetricsLoading } =
    useCustomMetrics();

  // Three "no usable profile" branches. Without these, the plugin
  // would fall back to the registry default for trackedHealth /
  // trackedCompetition and silently push wrong-by-default columns
  // into CODAP - invisible to upstream observers.
  if (loadState.status === "error") {
    return <CodapPluginProfileError kind={loadState.kind} onRetry={retry} />;
  }
  if (
    loadState.status === "missing" ||
    (loadState.status === "loaded" && !loadState.profile.profileComplete)
  ) {
    return <CodapPluginNoProfile />;
  }

  const profile = loadState.status === "loaded" ? loadState.profile : null;
  const profileLoading = loadState.status === "loading";

  const trackedHealth =
    profile?.trackedHealthMetrics ?? HEALTH_METRICS.map((m) => m.id);
  const trackedPerformance =
    profile?.trackedPerformanceMetrics ?? PERFORMANCE_METRICS.map((m) => m.id);
  const trackedCompetition =
    profile?.trackedCompetitionMetrics ??
    COMPETITION_METRICS.map((m) => m.id);

  return (
    <div className={css.pluginShell}>
      <PluginSignOutBar />
      <h1 className={css.heading}>DataGOAT in CODAP</h1>
      <CodapExportPanel
        health={{
          entries: health.status === "loaded" ? health.entries : [],
          loading:
            profileLoading ||
            customMetricsLoading ||
            health.status === "loading",
          tracked: trackedHealth,
          builtins: [...HEALTH_METRICS, ...ADDABLE_HEALTH],
        }}
        performance={{
          entries:
            performance.status === "loaded" ? performance.entries : [],
          loading:
            profileLoading ||
            customMetricsLoading ||
            performance.status === "loading",
          tracked: trackedPerformance,
          builtins: [...PERFORMANCE_METRICS, ...ADDABLE_PERFORMANCE],
        }}
        competition={{
          entries:
            competition.status === "loaded" ? competition.entries : [],
          loading:
            profileLoading ||
            customMetricsLoading ||
            competition.status === "loading",
          tracked: trackedCompetition,
          builtins: [...COMPETITION_METRICS, ...ADDABLE_COMPETITION],
        }}
        customMetrics={customMetrics}
      />
    </div>
  );
}

// `builtins` travels with each dataset (rather than the panel reading a
// fixed registry) so each caller supplies the right metric source. Users
// track built-ins by id via TrackedDataSetup, which merges each default-on
// registry with its ADDABLE_* set - so the authed export resolves each
// category against those SAME merged lists ([...HEALTH_METRICS,
// ...ADDABLE_HEALTH], etc.), matching every other consumer (MetricsDataEntryLog,
// Dashboard, MetricDetail). Otherwise a tracked ADDABLE_* built-in has no
// definition to resolve and its column is silently dropped. (The demo
// branch supplies its own sources - only metrics that have chart configs.)
interface CodapDataset<T> {
  entries: T[];
  loading: boolean;
  tracked: string[];
  builtins: MetricDefinition[];
}

interface CodapExportPanelProps {
  health: CodapDataset<HealthEntry>;
  performance: CodapDataset<PerformanceEntry>;
  competition: CodapDataset<CompetitionEntry>;
  customMetrics: CustomMetricDef[];
  // Optional prefix for dataset / table names (e.g. "Demo"). Demo mode sets
  // it so its sends land on distinct CODAP tables (DataGOAT-Demo-Health,
  // titled "Demo Health") and can never merge into or overwrite a real
  // signed-in user's tables of the same name. Undefined = no prefix (authed).
  namespaceLabel?: string;
}

function CodapExportPanel({
  health,
  performance,
  competition,
  customMetrics,
  namespaceLabel,
}: CodapExportPanelProps) {
  const { status, error, sendDataset } = useCodapApi();

  const healthEntries = health.entries;
  const performanceEntries = performance.entries;
  const competitionEntries = competition.entries;

  const [selected, setSelected] = useState<{
    health: boolean;
    performance: boolean;
    competition: boolean;
  }>({ health: true, performance: true, competition: true });
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<string | undefined>(undefined);
  // Synchronous re-entry gate. The disabled-button check uses `sending`
  // state, which only flips after React commits - a rapid double-click
  // between the click and that commit can otherwise launch two
  // interleaved sendDataset cycles against the same CODAP context,
  // defeating the upsert-by-date dedupe.
  const sendingRef = useRef(false);

  async function handleSend() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setLastSent(undefined);
    const ns = namespaceLabel ? `${namespaceLabel} ` : "";
    const nsCtx = namespaceLabel ? `${namespaceLabel}-` : "";
    try {
      // Always send if the dataset is selected, even when there are no
      // entries yet - CODAP needs the create-context + create-collection
      // + create-table calls to surface the table at all. Skipping on
      // empty data hides the table from the user.
      if (selected.health) {
        const metrics = resolveTrackedMetrics(
          health.tracked,
          health.builtins,
          customMetrics.filter((m) => m.metricType === "health"),
        );
        const { attributes, rows } = buildDataset(
          metrics,
          healthEntries,
          readHealthField,
        );
        await sendDataset({
          name: `DataGOAT-${nsCtx}Health`,
          title: `${ns}Health`,
          collectionName: `${ns}Health`,
          tableName: `${ns}Health`,
          attributes,
          rows,
        });
      }
      if (selected.performance) {
        const metrics = resolveTrackedMetrics(
          performance.tracked,
          performance.builtins,
          customMetrics.filter((m) => m.metricType === "performance"),
        );
        const { attributes, rows } = buildDataset(
          metrics,
          performanceEntries,
          readBagField,
        );
        await sendDataset({
          name: `DataGOAT-${nsCtx}Performance`,
          title: `${ns}Performance`,
          collectionName: `${ns}Performance`,
          tableName: `${ns}Performance`,
          attributes,
          rows,
        });
      }
      if (selected.competition) {
        const metrics = resolveTrackedMetrics(
          competition.tracked,
          competition.builtins,
          customMetrics.filter((m) => m.metricType === "competition"),
        );
        const { attributes, rows } = buildDataset(
          metrics,
          competitionEntries,
          readBagField,
        );
        await sendDataset({
          name: `DataGOAT-${nsCtx}Competition`,
          title: `${ns}Competition`,
          collectionName: `${ns}Competition`,
          tableName: `${ns}Competition`,
          attributes,
          rows,
        });
      }
      setLastSent(new Date().toLocaleTimeString());
    } catch (err) {
      logError(err, { source: "CodapPlugin.handleSend" });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const dataLoading =
    (selected.health && health.loading) ||
    (selected.performance && performance.loading) ||
    (selected.competition && competition.loading);

  const canSend =
    status === "connected" &&
    !dataLoading &&
    !sending &&
    (selected.health || selected.performance || selected.competition);

  return (
    <>
      <p className={css.statusText} role="status">
        {status === "connecting" && "Connecting to CODAP…"}
        {status === "connected" &&
          (dataLoading
            ? "Loading your data…"
            : "Connected. Choose what to send.")}
        {status === "disconnected" && (error ?? "Disconnected from CODAP.")}
      </p>

      <fieldset className={css.fieldset}>
        <legend className={css.legend}>Datasets</legend>
        <label className={css.checkRow}>
          <input
            type="checkbox"
            checked={selected.health}
            onChange={(e) =>
              setSelected((s) => ({ ...s, health: e.target.checked }))
            }
          />
          <span>
            Health ({healthEntries.length}{" "}
            {healthEntries.length === 1 ? "entry" : "entries"})
          </span>
        </label>
        <label className={css.checkRow}>
          <input
            type="checkbox"
            checked={selected.performance}
            onChange={(e) =>
              setSelected((s) => ({ ...s, performance: e.target.checked }))
            }
          />
          <span>
            Performance ({performanceEntries.length}{" "}
            {performanceEntries.length === 1 ? "entry" : "entries"})
          </span>
        </label>
        <label className={css.checkRow}>
          <input
            type="checkbox"
            checked={selected.competition}
            onChange={(e) =>
              setSelected((s) => ({ ...s, competition: e.target.checked }))
            }
          />
          <span>
            Competition ({competitionEntries.length}{" "}
            {competitionEntries.length === 1 ? "entry" : "entries"})
          </span>
        </label>
      </fieldset>

      <button
        type="button"
        className={buttons.ctaBtn}
        disabled={!canSend}
        onClick={() => void handleSend()}
      >
        {sending ? "Sending…" : "Send to CODAP"}
      </button>

      {lastSent && (
        <p className={css.statusText} role="status">
          Sent at {lastSent}.
        </p>
      )}
    </>
  );
}

// Demo variant: rendered when the plugin loads with ?demo. Bypasses all
// auth/profile gates and feeds the shared export panel synthetic entries
// (no Firestore, no sign-in). Metric sources per category:
//   health      -> HEALTH_METRICS (default-on)
//   competition -> COMPETITION_METRICS (default-on)
//   performance -> ADDABLE_PERFORMANCE (PERFORMANCE_METRICS is empty by
//                  design; the addable set is the real performance builtins)
// No custom metrics (there is no profile in demo mode). Each dataset's
// `builtins` matches its generator's metric source so resolveTrackedMetrics
// finds every id.
function CodapPluginDemo() {
  const healthEntries = useMemo(() => generateDemoHealthEntries(), []);
  const performanceEntries = useMemo(
    () => generateDemoPerformanceEntries(),
    [],
  );
  const competitionEntries = useMemo(
    () => generateDemoCompetitionEntries(),
    [],
  );
  return (
    <div className={css.pluginShell}>
      <h1 className={css.heading}>DataGOAT in CODAP</h1>
      <p className={css.statusText}>
        Demo data - generated sample entries, not saved.
      </p>
      <CodapExportPanel
        health={{
          entries: healthEntries,
          loading: false,
          tracked: HEALTH_METRICS.map((m) => m.id),
          builtins: HEALTH_METRICS,
        }}
        performance={{
          entries: performanceEntries,
          loading: false,
          tracked: ADDABLE_PERFORMANCE.map((m) => m.id),
          builtins: ADDABLE_PERFORMANCE,
        }}
        competition={{
          entries: competitionEntries,
          loading: false,
          tracked: COMPETITION_METRICS.map((m) => m.id),
          builtins: COMPETITION_METRICS,
        }}
        customMetrics={[]}
        namespaceLabel="Demo"
      />
    </div>
  );
}

function readHealthField(
  e: HealthEntry,
  id: string,
): string | number | null {
  switch (id) {
    case "hydration":
      return e.hydration ?? null;
    case "sleepTime":
      return e.sleepTime ?? null;
    case "sleepEfficiency":
      return e.sleepEfficiency ?? null;
    case "protein":
      return e.protein ?? null;
    case "leanMass":
      return e.leanMass ?? null;
    case "availability": {
      // Flatten the tree for CODAP - a single string captures the
      // four-cell state at a glance. An absent / undefined parent
      // means "not answered" and is rendered as the em dash sentinel
      // "—" that the prototype's CODAP export used (matched by
      // downstream workbooks). Participation booleans are mapped to
      // "played" / "dnp" strings here so the export format matches
      // the prototype convention.
      if (!e.availability) return null;
      const practicePart =
        typeof e.availability.practiceParticipation === "boolean"
          ? (e.availability.practiceParticipation ? "played" : "dnp")
          : "?";
      const gamePart =
        typeof e.availability.gameParticipation === "boolean"
          ? (e.availability.gameParticipation ? "played" : "dnp")
          : "?";
      return [
        e.availability.practiceHeld === undefined
          ? "—"
          : e.availability.practiceHeld
            ? `practice:${practicePart}`
            : "no-practice",
        e.availability.gameHeld === undefined
          ? "—"
          : e.availability.gameHeld
            ? `game:${gamePart}`
            : "no-game",
      ].join(" / ");
    }
    default: {
      const v = e.customMetrics?.[id];
      return typeof v === "number" || typeof v === "string" ? v : null;
    }
  }
}

// Reads a metric value from a competition/performance entry's metrics
// bag, coercing absent/undefined to null so buildDataset emits an empty
// cell rather than a stray value.
function readBagField(
  e: { metrics?: Record<string, number | string | undefined> },
  id: string,
): RawValue {
  const v = e.metrics?.[id];
  return typeof v === "number" || typeof v === "string" ? v : null;
}
