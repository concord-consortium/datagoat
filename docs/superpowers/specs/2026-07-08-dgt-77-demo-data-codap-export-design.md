# Demo data in the CODAP export

**Date:** 2026-07-08
**Branch:** `DGT-77-unified-codap-export`
**Status:** Approved design

## Problem

The CODAP export (`/codap`) reads a signed-in user's real data from Firestore.
Testing it therefore requires signing in with a complete profile and hand-entering
enough Health / Performance / Competition entries to see meaningful columns and
rows land in CODAP. That is slow and repetitive.

The app already has a `?demo` URL parameter (`DemoModeContext`) that populates the
dashboard charts with generated data (`useChartSeries.generateDemoSeries`). We want
`?demo` to also drive the export, so a developer can open the dashboard in demo
mode, click through to CODAP, and see generated data flow into CODAP with **no
sign-in and no Firestore**.

## Why it isn't automatic today

- **The `?demo` param never reaches the plugin iframe.** The export runs inside the
  CODAP iframe at `<origin>/codap`, and `buildCodapWrappedUrl()`
  (`src/codap/codapUrl.ts`) drops all query params when it builds the `di=` URL.
- **Demo data and export data don't share a layer.** Demo data is generated
  per-metric as `{date, value}[]` inside `useChartSeries`; it is never materialized
  as `HealthEntry` / `PerformanceEntry` / `CompetitionEntry` objects. The export's
  `readHealthField` / `readBagField` accessors need whole entry objects.
- **The plugin gates on auth.** `CodapPlugin` requires sign-in → email-verified →
  `profileComplete` before it reaches the export panel.

`DemoModeProvider` already wraps the entire route tree (`App.tsx`), including the
`/codap` route, so once `?demo` is in the iframe URL, `useDemoMode()` returns `true`
inside the plugin.

## Decision: demo mode bypasses auth entirely

When `?demo` is present, the plugin short-circuits **before** the auth/profile gates
and renders synthetic data only. Rationale:

- The whole point is fast testing: open `/codap?demo` (or click through from
  `/dashboard?demo`) and immediately see generated data export, no account needed.
- It is safe: demo mode reads **no** Firestore and shows **only** synthetic data, so
  there is no private data to protect behind the auth gate.
- It is the cleanest isolation: a new demo branch that short-circuits does not touch
  the real authed logic.

Consequence: demo mode has no profile, so it exports **all built-in metrics** per
category (no tracked-metric selection) and **no custom metrics**. Exercising the
profile-driven column selection / custom-metric path still requires a real sign-in;
that is an accepted trade-off.

## Design

### 1. Propagate `?demo` into the CODAP iframe URL

`buildCodapWrappedUrl()` reads `window.location.search`; when `demo` is present it
appends `?demo` to the `di=` plugin path:

```
https://codap3.concord.org?di=<origin>/codap?demo
```

No caller changes are needed. This automatically covers both callers:

- **`CodapButton`** (dashboard) — window is at `/dashboard?demo`, so the built URL
  carries demo through.
- **`main.tsx`** top-level redirect — window is at `/codap?demo`, so the redirect
  target carries demo through; inside the iframe `shouldRedirectToCodap()` returns
  false (framed) and the plugin renders.

**Integration risk to verify at runtime:** this relies on CODAP preserving the query
string of the `di` value when it loads the plugin iframe. This must be confirmed by
actually running the flow (dashboard → CODAP), not by unit tests alone. If CODAP
strips the query, fall back to URL-encoding the `di` value.

### 2. New module: `src/codap/demoEntries.ts`

Generates real entry objects that the existing export transform consumes unchanged.

Public API (each defaulting `days = 30`, `seed = SESSION_SEED`, so tests can pass a
fixed seed for reproducibility):

```ts
export function generateDemoHealthEntries(days?: number, seed?: number): HealthEntry[]
export function generateDemoPerformanceEntries(days?: number, seed?: number): PerformanceEntry[]
export function generateDemoCompetitionEntries(days?: number, seed?: number): CompetitionEntry[]
```

Generation rules (one entry per day, most recent `days` days via `isoAtDaysAgo`):

- Values come from `getMetricChartConfig(id).random(rng)` (the same generators the
  charts use), seeded per (seed, metricId, day) via `randomValues`
  (`seededRng` / `hashSeed`).
- A ~20% null rate leaves a field **absent** (mirrors `DEMO_NULL_RATE`), which the
  export renders as an empty cell — exercising the null path.
- **Health** placement mirrors `readHealthField` exactly:
  - `hydration`, `sleepTime`, `sleepEfficiency`, `protein`, `leanMass` → typed fields
  - `availability` → a generated tree (random `practiceHeld` / `gameHeld` and, when
    held, participation booleans; sometimes an empty `{}` = "not answered")
  - everything else (`mood`, `relativeProteinIntake`, …) → the `customMetrics` bag
- **Performance / Competition** — all values into the `metrics` bag (mirrors
  `readBagField`).

Because these are genuine `HealthEntry` / `PerformanceEntry` / `CompetitionEntry`
objects, `resolveTrackedMetrics` and `buildDataset` are used **unchanged**.

### 3. Extract `CodapExportPanel` from `CodapPluginAuthed`

Pull the dataset checkboxes + `handleSend` + status UI out of `CodapPluginAuthed`
into a presentational component so the demo and authed branches share one panel:

```ts
interface CodapExportPanelProps {
  health: { entries: HealthEntry[]; loading: boolean };
  performance: { entries: PerformanceEntry[]; loading: boolean };
  competition: { entries: CompetitionEntry[]; loading: boolean };
  trackedHealth: string[];
  trackedPerformance: string[];
  trackedCompetition: string[];
  customMetrics: CustomMetricDef[];
}
```

The panel owns `selected` / `sending` state, `sendingRef`, `handleSend`, and the
existing UI. `readHealthField` / `readBagField` stay module-level and are shared by
both branches. `dataLoading` is computed inside the panel from `selected` + the
per-dataset `loading` flags.

- **`CodapPluginAuthed`** resolves Firestore entries + profile-tracked ids + real
  customs and renders `<CodapExportPanel>`. Behavior is unchanged.
- **`CodapPluginDemo`** (new) generates entries with `useMemo`, passes **all**
  built-in metric ids per category, `customMetrics: []`, `loading: false`, and
  renders a small "Demo data" notice instead of `PluginSignOutBar`.

`CodapPlugin()` calls `useDemoMode()` and `useAuth()` unconditionally (stable hook
order), then:

```tsx
export default function CodapPlugin() {
  const demoMode = useDemoMode();
  const { user, loading, isEmailVerifiedOrTrusted } = useAuth();
  if (demoMode) return <CodapPluginDemo />;
  // ...existing loading / sign-in / verify / authed gates
}
```

### 4. Testing

- **`demoEntries.test.ts`**
  - Entry shapes and counts (`days` entries per category, valid ISO dates).
  - Values fall within each metric's configured range; `availability` tree present
    and well-formed.
  - Determinism: same seed → same output.
  - End-to-end: run generated entries through `resolveTrackedMetrics` +
    `buildDataset` and assert the resulting rows have the `date` attribute plus the
    expected metric columns, with at least some populated (non-null) cells. This
    proves the demo → export path works without touching the transform.
- **`codapUrl.test.ts`** — add cases for the `?demo` suffix present / absent,
  stubbing `window.location.search`.
- **`CodapPlugin.test.tsx`** — the extraction must keep existing tests green. Add a
  demo-branch render test if feasible without heavy `codap-plugin-api` mocking.

## Out of scope (YAGNI)

- Refactoring the dashboard charts onto this shared entry generator. It would make
  charts and export consistent in demo mode, but is a separate change with its own
  risk; noted as a possible follow-up.
- Respecting per-metric schedules (e.g. `leanMass` is 2–3×/year). Demo applies the
  null rate uniformly; the goal is populated CODAP tables, not schedule fidelity.
