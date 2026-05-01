import { useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useUser } from "../contexts/UserContext";
import {
  useWellnessData,
  usePerformanceData,
} from "../contexts/DataContext";
import { WELLNESS_METRICS } from "../metrics/wellnessMetrics";
import { PERFORMANCE_METRICS } from "../metrics/performanceMetrics";
import type { WellnessEntry, PerformanceEntry } from "../types/data";
import { logError } from "../utils/logError";
import { useCodapApi, type DatasetRow } from "./codapApi";
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
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className={css.pluginShell}>
        <p className={css.statusText}>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <CodapPluginSignIn />;
  }

  if (!user.emailVerified) {
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

// The verified-email gate here is UI-only: a revived IDB session with
// emailVerified=false renders this branch without auto-revoking, and the
// user signs out via PluginSignOutBar. The actual security boundary is
// the per-user Firestore rule (request.auth.uid == userId), which does
// not gate on email_verified per spec. Don't add hooks that consume
// useUser() in this branch - that would leak unverified-user data into
// components that aren't supposed to see it.
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

function CodapPluginAuthed() {
  const { status, error, sendDataset } = useCodapApi();
  const { loadState } = useUser();
  const wellness = useWellnessData();
  const performance = usePerformanceData();

  const profile = loadState.status === "loaded" ? loadState.profile : null;
  const [selected, setSelected] = useState<{
    wellness: boolean;
    performance: boolean;
  }>({
    wellness: true,
    performance: true,
  });
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<string | undefined>(undefined);
  // Synchronous re-entry gate. The disabled-button check uses `sending`
  // state, which only flips after React commits - a rapid double-click
  // between the click and that commit can otherwise launch two
  // interleaved sendDataset cycles against the same CODAP context,
  // defeating the upsert-by-date dedupe.
  const sendingRef = useRef(false);

  const wellnessEntries =
    wellness.status === "loaded" ? wellness.entries : [];
  const performanceEntries =
    performance.status === "loaded" ? performance.entries : [];

  const trackedWellness =
    profile?.trackedWellnessMetrics ?? WELLNESS_METRICS.map((m) => m.id);
  const trackedPerformance =
    profile?.trackedPerformanceMetrics ??
    PERFORMANCE_METRICS.map((m) => m.id);

  async function handleSend() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setLastSent(undefined);
    try {
      // Always send if the dataset is selected, even when there are no
      // entries yet - CODAP needs the create-context + create-collection
      // + create-table calls to surface the table at all. Skipping on
      // empty data hides the table from the user.
      if (selected.wellness) {
        const attrs = ["date", ...trackedWellness];
        const rows = wellnessEntries.map((e) =>
          wellnessEntryToRow(e, trackedWellness),
        );
        await sendDataset({
          name: "DataGOAT-Wellness",
          title: "Health & Wellness",
          collectionName: "Health-and-Wellness",
          tableName: "Health-and-Wellness",
          attributes: attrs,
          rows,
        });
      }
      if (selected.performance) {
        const attrs = ["date", ...trackedPerformance];
        const rows = performanceEntries.map((e) =>
          performanceEntryToRow(e, trackedPerformance),
        );
        await sendDataset({
          name: "DataGOAT-Performance",
          title: "Performance",
          collectionName: "Performance",
          attributes: attrs,
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
    loadState.status === "loading" ||
    (selected.wellness && wellness.status === "loading") ||
    (selected.performance && performance.status === "loading");

  const canSend =
    status === "connected" &&
    !dataLoading &&
    !sending &&
    (selected.wellness || selected.performance);

  return (
    <div className={css.pluginShell}>
      <PluginSignOutBar />
      <h1 className={css.heading}>DataGOAT in CODAP</h1>
      <p className={css.statusText}>
        {status === "connecting" && "Connecting to CODAP…"}
        {status === "connected" &&
          (dataLoading
            ? "Loading your data…"
            : "Connected. Choose what to send.")}
        {status === "disconnected" &&
          (error ?? "Disconnected from CODAP.")}
      </p>

      <fieldset className={css.fieldset}>
        <legend className={css.legend}>Datasets</legend>
        <label className={css.checkRow}>
          <input
            type="checkbox"
            checked={selected.wellness}
            onChange={(e) =>
              setSelected((s) => ({ ...s, wellness: e.target.checked }))
            }
          />
          <span>
            Health &amp; Wellness ({wellnessEntries.length}{" "}
            {wellnessEntries.length === 1 ? "entry" : "entries"})
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
    </div>
  );
}

function wellnessEntryToRow(
  e: WellnessEntry,
  trackedIds: string[],
): DatasetRow {
  const row: DatasetRow = { date: e.date };
  for (const id of trackedIds) {
    row[id] = readWellnessField(e, id);
  }
  return row;
}

function readWellnessField(
  e: WellnessEntry,
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
    case "availability":
      // Flatten the tree for CODAP - a single string captures the
      // four-cell state at a glance.
      if (!e.availability) return null;
      return [
        e.availability.practiceHeld === null
          ? "—"
          : e.availability.practiceHeld
            ? `practice:${e.availability.practiceParticipation ?? "?"}`
            : "no-practice",
        e.availability.gameHeld === null
          ? "—"
          : e.availability.gameHeld
            ? `game:${e.availability.gameParticipation ?? "?"}`
            : "no-game",
      ].join(" / ");
    default:
      return null;
  }
}

function performanceEntryToRow(
  e: PerformanceEntry,
  trackedIds: string[],
): DatasetRow {
  const row: DatasetRow = { date: e.date };
  for (const id of trackedIds) {
    const v = e.metrics?.[id];
    row[id] = typeof v === "number" || typeof v === "string" ? v : null;
  }
  return row;
}
