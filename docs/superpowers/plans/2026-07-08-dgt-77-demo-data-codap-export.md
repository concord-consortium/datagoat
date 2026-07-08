# Demo Data in the CODAP Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `?demo` is present, `/codap` exports generated synthetic entries with no sign-in and no Firestore, so the CODAP export can be tested end-to-end from the dashboard.

**Architecture:** Propagate `?demo` from the current URL into the CODAP iframe's `di=` target so `useDemoMode()` returns true inside the plugin. Add a `demoEntries` generator that produces real `HealthEntry` / `PerformanceEntry` / `CompetitionEntry` objects (reusing the chart-config random generators), so the existing `resolveTrackedMetrics` + `buildDataset` transform runs unchanged. Extract the export UI into a shared `CodapExportPanel` and add a demo branch that short-circuits before the auth gates.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, react-router-dom.

## Global Constraints

- Verify TypeScript with `npm run build` (runs `tsc -b`); `tsc --noEmit` misses build-mode errors.
- No em dashes in code/comments/copy — use regular hyphens.
- Named imports stay alphabetical.
- Conditional JSX uses the project `<If condition={...}>` component, not `{x && <JSX/>}` short-circuits.
- CSS lives in adjacent `*.module.css` files; no inline restructuring of unrelated styles.
- Tests are colocated `*.test.ts` / `*.test.tsx`, run via `npm test` (Vitest).
- Commit multi-line messages via a temp file with `git commit -F <file>`, never a heredoc.

---

### Task 1: Propagate `?demo` into the CODAP wrapped URL

**Files:**
- Modify: `src/codap/codapUrl.ts` (function `buildCodapWrappedUrl`, lines 26-28)
- Test: `src/codap/codapUrl.test.ts` (extend existing `describe("buildCodapWrappedUrl")`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildCodapWrappedUrl(): string` — unchanged signature. When the current `window.location.search` contains a `demo` param, the returned URL's `di=` target ends with `/codap?demo`; otherwise `/codap` (existing behavior).

- [ ] **Step 1: Write the failing tests**

Add these two `it` blocks inside the existing `describe("buildCodapWrappedUrl", ...)` in `src/codap/codapUrl.test.ts`, after the preview-channel test (the `stubLocation` helper already accepts a full URL including a query string):

```ts
  it("appends ?demo to the di target when demo is present in the current URL", () => {
    stubLocation("http://localhost:5173/dashboard?demo");
    expect(buildCodapWrappedUrl()).toBe(
      "https://codap3.concord.org?di=http://localhost:5173/codap?demo",
    );
  });

  it("omits the demo suffix when the current URL has no demo param", () => {
    stubLocation("http://localhost:5173/dashboard");
    expect(buildCodapWrappedUrl()).toBe(
      "https://codap3.concord.org?di=http://localhost:5173/codap",
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/codap/codapUrl.test.ts`
Expected: the new "appends ?demo" test FAILS (received URL ends with `/codap`, not `/codap?demo`); the "omits" test passes.

- [ ] **Step 3: Implement the demo suffix**

Replace `buildCodapWrappedUrl` in `src/codap/codapUrl.ts` (lines 26-28) with:

```ts
export function buildCodapWrappedUrl(): string {
  const demo =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") !== null;
  return `${CODAP_ORIGIN}?di=${diOrigin()}/codap${demo ? "?demo" : ""}`;
}
```

Update the function's doc comment (lines 1-11 region) is not required, but add a one-line note above the function:

```ts
// When the current page carries `?demo`, the flag is threaded onto the
// di= plugin path (`/codap?demo`) so DemoModeProvider inside the CODAP
// iframe puts the export panel into demo mode. Covers both callers: the
// dashboard button (window at /dashboard?demo) and the main.tsx top-level
// redirect (window at /codap?demo).
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/codap/codapUrl.test.ts`
Expected: PASS (all `buildCodapWrappedUrl` and `shouldRedirectToCodap` tests green).

- [ ] **Step 5: Commit**

Write the message to a temp file and commit:

```bash
printf '%s\n' \
  'feat(dgt-77): propagate ?demo into CODAP wrapped URL [DGT-77]' \
  '' \
  'buildCodapWrappedUrl appends ?demo to the di= plugin path when the' \
  'current page carries the flag, so DemoModeProvider inside the CODAP' \
  'iframe can put the export into demo mode.' \
  '' \
  'Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>' \
  > /tmp/dgt77-t1.txt
git add src/codap/codapUrl.ts src/codap/codapUrl.test.ts
git commit -F /tmp/dgt77-t1.txt
```

---

### Task 2: Demo entry generator (`demoEntries.ts`)

**Files:**
- Create: `src/codap/demoEntries.ts`
- Test: `src/codap/demoEntries.test.ts`

**Interfaces:**
- Consumes: `HEALTH_METRICS` (`src/metrics/healthMetrics.ts`), `PERFORMANCE_METRICS` (`src/metrics/performanceMetrics.ts`), `COMPETITION_METRICS` (`src/metrics/competitionMetrics.ts`), `getMetricChartConfig` (`src/charts/metricChartConfig.ts`), `seededRng` / `hashSeed` (`src/charts/randomValues.ts`), `isoAtDaysAgo` (`src/utils/dates.ts`), entry types + version constants (`src/types/data.ts`, `src/migrations/*`).
- Produces:
  - `generateDemoHealthEntries(days?: number, seed?: number): HealthEntry[]`
  - `generateDemoPerformanceEntries(days?: number, seed?: number): PerformanceEntry[]`
  - `generateDemoCompetitionEntries(days?: number, seed?: number): CompetitionEntry[]`
  - `DEMO_DAYS: number` (exported constant, value 30)

  Each returns `days` entries, one per day, most-recent-first-day-last (oldest at index 0), with values from each metric's chart-config `random` generator and a ~20% null rate leaving fields absent. Health placement mirrors `readHealthField`: the 5 numeric fields are typed slots, `availability` is a generated tree, everything else (e.g. `mood`, `relativeProteinIntake`) lands in the `customMetrics` bag. Performance/competition values all land in the `metrics` bag.

- [ ] **Step 1: Write the failing tests**

Create `src/codap/demoEntries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEMO_DAYS,
  generateDemoCompetitionEntries,
  generateDemoHealthEntries,
  generateDemoPerformanceEntries,
} from "./demoEntries";
import { buildDataset, resolveTrackedMetrics } from "./codapExport";
import { PERFORMANCE_METRICS } from "../metrics/performanceMetrics";
import { COMPETITION_METRICS } from "../metrics/competitionMetrics";

// Local copies of the plugin's field accessors so the test exercises the
// same demo -> export path the plugin uses. Kept in sync with the
// readHealthField / readBagField exported for Task 3.
function readBag(
  e: { metrics?: Record<string, number | string | undefined> },
  id: string,
): string | number | null {
  const v = e.metrics?.[id];
  return typeof v === "number" || typeof v === "string" ? v : null;
}

describe("demoEntries", () => {
  it("generates the requested number of daily entries with ISO dates", () => {
    const health = generateDemoHealthEntries(7, 12345);
    expect(health).toHaveLength(7);
    for (const e of health) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Dates are strictly increasing (oldest first).
    const dates = health.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("defaults to DEMO_DAYS entries", () => {
    expect(generateDemoPerformanceEntries()).toHaveLength(DEMO_DAYS);
    expect(DEMO_DAYS).toBe(30);
  });

  it("is deterministic for a fixed seed", () => {
    expect(generateDemoHealthEntries(10, 777)).toEqual(
      generateDemoHealthEntries(10, 777),
    );
  });

  it("puts the 5 numeric health metrics in typed fields and generates an availability tree", () => {
    // Large day count so the ~20% null rate almost surely leaves at least
    // one populated value per field across the run.
    const entries = generateDemoHealthEntries(200, 42);
    const hasNumber = (k: "hydration" | "sleepTime" | "protein") =>
      entries.some((e) => typeof e[k] === "number");
    expect(hasNumber("hydration")).toBe(true);
    expect(hasNumber("sleepTime")).toBe(true);
    expect(hasNumber("protein")).toBe(true);
    // Availability is a tree object, never a bare number.
    const answered = entries.filter(
      (e) => Object.keys(e.availability).length > 0,
    );
    expect(answered.length).toBeGreaterThan(0);
    for (const e of answered) {
      expect(typeof e.availability.practiceHeld === "boolean" ||
        typeof e.availability.gameHeld === "boolean").toBe(true);
    }
    // mood is not a typed field: it lands in the customMetrics bag.
    expect(
      entries.some((e) => typeof e.customMetrics?.mood === "number"),
    ).toBe(true);
  });

  it("performance/competition values land in the metrics bag and export to rows", () => {
    const perf = generateDemoPerformanceEntries(30, 5);
    const metrics = resolveTrackedMetrics(
      PERFORMANCE_METRICS.map((m) => m.id),
      PERFORMANCE_METRICS,
      [],
    );
    const { attributes, rows } = buildDataset(metrics, perf, readBag);
    expect(attributes[0]).toEqual({ name: "date", type: "date" });
    expect(rows).toHaveLength(30);
    // At least one non-null, non-date cell somewhere in the table.
    const populated = rows.some((row) =>
      Object.entries(row).some(([k, v]) => k !== "date" && v != null),
    );
    expect(populated).toBe(true);

    const comp = generateDemoCompetitionEntries(30, 5);
    const compMetrics = resolveTrackedMetrics(
      COMPETITION_METRICS.map((m) => m.id),
      COMPETITION_METRICS,
      [],
    );
    const compResult = buildDataset(compMetrics, comp, readBag);
    expect(compResult.rows).toHaveLength(30);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/codap/demoEntries.test.ts`
Expected: FAIL with a module-not-found / import error for `./demoEntries`.

- [ ] **Step 3: Implement the generator**

Create `src/codap/demoEntries.ts`:

```ts
// Synthetic entry generator for demo mode (?demo). Produces real
// HealthEntry / PerformanceEntry / CompetitionEntry objects so the CODAP
// export's resolveTrackedMetrics + buildDataset run unchanged - the demo
// path exercises the same transform as real Firestore data. Values come
// from the same per-metric random generators the dashboard charts use
// (getMetricChartConfig().random), seeded per (seed, category, metricId,
// day) so a fixed seed is reproducible. A ~20% null rate leaves fields
// absent, which the export renders as empty cells.
import { COMPETITION_METRICS } from "../metrics/competitionMetrics";
import { HEALTH_METRICS } from "../metrics/healthMetrics";
import { PERFORMANCE_METRICS } from "../metrics/performanceMetrics";
import { getMetricChartConfig } from "../charts/metricChartConfig";
import { hashSeed, seededRng } from "../charts/randomValues";
import { CURRENT_COMPETITION_ENTRY_VERSION } from "../migrations/competitionEntry";
import { CURRENT_HEALTH_ENTRY_VERSION } from "../migrations/healthEntry";
import { CURRENT_PERFORMANCE_ENTRY_VERSION } from "../migrations/performanceEntry";
import type {
  CompetitionEntry,
  HealthEntry,
  PerformanceEntry,
} from "../types/data";
import { isoAtDaysAgo } from "../utils/dates";

// Default number of daily demo entries per dataset.
export const DEMO_DAYS = 30;

// Matches useChartSeries.DEMO_NULL_RATE: fraction of fields left absent.
const DEMO_NULL_RATE = 0.2;

// Session seed: stable within a page load, varies between loads. Mixed
// into every per-field seed so demo data differs each time the plugin is
// opened (mirrors the chart demo path). Tests pass an explicit seed.
const SESSION_SEED = Math.floor(Math.random() * 0xffffffff);

// The five HealthEntry fields that are typed numeric slots (everything
// else on a health entry - mood, relativeProteinIntake, custom metrics -
// lives in the customMetrics bag, matching readHealthField).
type NumericHealthField =
  | "hydration"
  | "sleepTime"
  | "sleepEfficiency"
  | "protein"
  | "leanMass";
const NUMERIC_HEALTH_FIELDS = new Set<string>([
  "hydration",
  "sleepTime",
  "sleepEfficiency",
  "protein",
  "leanMass",
]);

function rngFor(seed: number, category: string, metricId: string, day: number) {
  return seededRng(hashSeed(`${seed}:${category}:${metricId}:${day}`));
}

function randomAvailability(
  rng: () => number,
): HealthEntry["availability"] {
  // ~20% "not answered" (empty tree), matching the null rate for scalars.
  if (rng() < DEMO_NULL_RATE) return {};
  const practiceHeld = rng() < 0.7;
  const gameHeld = rng() < 0.4;
  const tree: HealthEntry["availability"] = { practiceHeld, gameHeld };
  if (practiceHeld) tree.practiceParticipation = rng() < 0.85;
  if (gameHeld) tree.gameParticipation = rng() < 0.85;
  return tree;
}

export function generateDemoHealthEntries(
  days: number = DEMO_DAYS,
  seed: number = SESSION_SEED,
): HealthEntry[] {
  const out: HealthEntry[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const entry: HealthEntry = {
      version: CURRENT_HEALTH_ENTRY_VERSION,
      date: isoAtDaysAgo(i),
      availability: {},
    };
    const bag: Record<string, number | string> = {};
    for (const m of HEALTH_METRICS) {
      const rng = rngFor(seed, "health", m.id, i);
      if (m.id === "availability") {
        entry.availability = randomAvailability(rng);
        continue;
      }
      if (rng() < DEMO_NULL_RATE) continue; // leave absent
      const value = getMetricChartConfig(m.id).random(rng);
      if (NUMERIC_HEALTH_FIELDS.has(m.id)) {
        entry[m.id as NumericHealthField] = value;
      } else {
        bag[m.id] = value;
      }
    }
    if (Object.keys(bag).length > 0) entry.customMetrics = bag;
    out.push(entry);
  }
  return out;
}

function generateBagEntries(
  metrics: ReadonlyArray<{ id: string }>,
  category: string,
  version: number,
  days: number,
  seed: number,
): Array<{ version: number; date: string; metrics: Record<string, number | string> }> {
  const out: Array<{
    version: number;
    date: string;
    metrics: Record<string, number | string>;
  }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const bag: Record<string, number | string> = {};
    for (const m of metrics) {
      const rng = rngFor(seed, category, m.id, i);
      if (rng() < DEMO_NULL_RATE) continue; // leave absent
      bag[m.id] = getMetricChartConfig(m.id).random(rng);
    }
    out.push({ version, date: isoAtDaysAgo(i), metrics: bag });
  }
  return out;
}

export function generateDemoPerformanceEntries(
  days: number = DEMO_DAYS,
  seed: number = SESSION_SEED,
): PerformanceEntry[] {
  return generateBagEntries(
    PERFORMANCE_METRICS,
    "performance",
    CURRENT_PERFORMANCE_ENTRY_VERSION,
    days,
    seed,
  );
}

export function generateDemoCompetitionEntries(
  days: number = DEMO_DAYS,
  seed: number = SESSION_SEED,
): CompetitionEntry[] {
  return generateBagEntries(
    COMPETITION_METRICS,
    "competition",
    CURRENT_COMPETITION_ENTRY_VERSION,
    days,
    seed,
  );
}
```

If `getMetricChartConfig(m.id).random` returns a non-number for any id, the value still round-trips as a bag value; but all built-in configs return numbers, so `bag[m.id]` is always a number here.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/codap/demoEntries.test.ts`
Expected: PASS (all five tests: counts/dates, default DEMO_DAYS, determinism, health placement, and the performance/competition transform).

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: no TypeScript errors. (If `entry[m.id as NumericHealthField] = value` errors, confirm the field type on `HealthEntry` is `number | undefined`; `value` is `number` from the config generator.)

- [ ] **Step 6: Commit**

```bash
printf '%s\n' \
  'feat(dgt-77): add demo entry generator for CODAP export [DGT-77]' \
  '' \
  'generateDemoHealthEntries / Performance / Competition produce real' \
  'entry objects (typed health fields + availability tree + bag) from the' \
  'chart-config random generators, so resolveTrackedMetrics + buildDataset' \
  'run unchanged on synthetic demo data.' \
  '' \
  'Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>' \
  > /tmp/dgt77-t2.txt
git add src/codap/demoEntries.ts src/codap/demoEntries.test.ts
git commit -F /tmp/dgt77-t2.txt
```

---

### Task 3: Extract `CodapExportPanel` and add the demo branch

**Files:**
- Modify: `src/codap/CodapPlugin.tsx` (extract panel from `CodapPluginAuthed` lines 164-383; add `CodapPluginDemo`; wire `useDemoMode` into `CodapPlugin` lines 36-56; export `readHealthField` / `readBagField` if needed by the panel — they already live module-level in this file, so no cross-file export is required)
- Test: `src/codap/CodapPlugin.test.tsx` (add demo-mode mock + demo-branch test; existing tests stay green)

**Interfaces:**
- Consumes: `generateDemoHealthEntries`, `generateDemoPerformanceEntries`, `generateDemoCompetitionEntries` (Task 2); `useDemoMode` (`src/contexts/DemoModeContext.tsx`); all existing imports in `CodapPlugin.tsx`.
- Produces (internal to the file): a `CodapExportPanel` component with props:
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

- [ ] **Step 1: Add the demo-mode mock to the existing test file (keeps existing tests green)**

In `src/codap/CodapPlugin.test.tsx`, add a demo-state object and mock near the other `vi.mock` blocks (after the `useCustomMetrics` mock at line 163), and reset it in `beforeEach`:

```ts
const demoState = { enabled: false };
vi.mock("../contexts/DemoModeContext", () => ({
  useDemoMode: () => demoState.enabled,
}));
```

Add to the `beforeEach` (alongside the other resets, around line 177):

```ts
    demoState.enabled = false;
```

- [ ] **Step 2: Add the failing demo-branch test**

Add this `it` block at the end of the `describe("CodapPlugin", ...)` in `src/codap/CodapPlugin.test.tsx`. It sets no auth/profile at all (defaults from `beforeEach`: user null, loading false) and asserts the export UI renders anyway with 30 demo entries per dataset:

```ts
  it("demo mode bypasses auth and renders the export panel with generated entries", async () => {
    demoState.enabled = true;
    ctx.authState = { user: null, loading: false };
    userState.loadState = { status: "loading" };
    codapState.status = "connected";

    const user = userEvent.setup();
    render(<CodapPlugin />);

    // No sign-in gate.
    expect(
      screen.queryByRole("button", { name: /continue with google/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();

    // Export panel present, populated with 30 demo entries per dataset.
    expect(screen.getByText(/health \(30 entries\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/performance \(30 entries\)/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/competition \(30 entries\)/i),
    ).toBeInTheDocument();

    const sendBtn = screen.getByRole("button", { name: /send to codap/i });
    expect(sendBtn).toBeEnabled();
    await user.click(sendBtn);
    expect(sendDatasetMock).toHaveBeenCalledTimes(3);
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- src/codap/CodapPlugin.test.tsx`
Expected: the new demo test FAILS (the sign-in panel renders because the demo branch does not exist yet); existing tests still pass.

- [ ] **Step 4: Extract `CodapExportPanel` from `CodapPluginAuthed`**

In `src/codap/CodapPlugin.tsx`:

a. Add imports (keep alphabetical within groups):

```ts
import { useDemoMode } from "../contexts/DemoModeContext";
import {
  generateDemoCompetitionEntries,
  generateDemoHealthEntries,
  generateDemoPerformanceEntries,
} from "./demoEntries";
import type {
  CompetitionEntry,
  HealthEntry,
  PerformanceEntry,
} from "../types/data";
import type { CustomMetricDef } from "../types/customMetrics";
import { useMemo } from "react";
```

(Merge `useMemo` into the existing `react` import line: `import { useMemo, useRef, useState } from "react";`. `HealthEntry` is already imported at line 13 — extend that type import to add `CompetitionEntry` and `PerformanceEntry` rather than adding a second import line.)

b. Create the presentational panel. Move the state (`selected`, `sending`, `lastSent`, `sendingRef`), `handleSend`, `dataLoading`, `canSend`, and the returned JSX (current lines 187-382) into it, replacing the direct hook reads with props:

```tsx
interface CodapExportPanelProps {
  health: { entries: HealthEntry[]; loading: boolean };
  performance: { entries: PerformanceEntry[]; loading: boolean };
  competition: { entries: CompetitionEntry[]; loading: boolean };
  trackedHealth: string[];
  trackedPerformance: string[];
  trackedCompetition: string[];
  customMetrics: CustomMetricDef[];
}

function CodapExportPanel({
  health,
  performance,
  competition,
  trackedHealth,
  trackedPerformance,
  trackedCompetition,
  customMetrics,
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
  const sendingRef = useRef(false);

  async function handleSend() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setLastSent(undefined);
    try {
      if (selected.health) {
        const metrics = resolveTrackedMetrics(
          trackedHealth,
          HEALTH_METRICS,
          customMetrics.filter((m) => m.metricType === "health"),
        );
        const { attributes, rows } = buildDataset(
          metrics,
          healthEntries,
          readHealthField,
        );
        await sendDataset({
          name: "DataGOAT-Health",
          title: "Health",
          collectionName: "Health",
          tableName: "Health",
          attributes,
          rows,
        });
      }
      if (selected.performance) {
        const metrics = resolveTrackedMetrics(
          trackedPerformance,
          PERFORMANCE_METRICS,
          customMetrics.filter((m) => m.metricType === "performance"),
        );
        const { attributes, rows } = buildDataset(
          metrics,
          performanceEntries,
          readBagField,
        );
        await sendDataset({
          name: "DataGOAT-Performance",
          title: "Performance",
          collectionName: "Performance",
          tableName: "Performance",
          attributes,
          rows,
        });
      }
      if (selected.competition) {
        const metrics = resolveTrackedMetrics(
          trackedCompetition,
          COMPETITION_METRICS,
          customMetrics.filter((m) => m.metricType === "competition"),
        );
        const { attributes, rows } = buildDataset(
          metrics,
          competitionEntries,
          readBagField,
        );
        await sendDataset({
          name: "DataGOAT-Competition",
          title: "Competition",
          collectionName: "Competition",
          tableName: "Competition",
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
```

Note the one behavior-preserving change: `dataLoading` previously also OR-ed `loadState.status === "loading"`. That profile-loading gate stays in `CodapPluginAuthed` (see Step 5) — the authed branch passes `health.loading = health.status === "loading" || profileLoading` so the panel's status/disable behavior is unchanged. See Step 5 for the exact wiring.

- [ ] **Step 5: Rewrite `CodapPluginAuthed` to resolve data and render the panel**

Replace the body of `CodapPluginAuthed` (from line 164 through the end of its `return (...)`, but keep the three "no usable profile" guards) so it computes the tracked ids + entries and delegates rendering to the panel. Fold the former profile-loading contribution to `dataLoading` into the `loading` flags passed to the panel:

```tsx
function CodapPluginAuthed() {
  const { loadState, retry } = useUser();
  const health = useHealthData();
  const performance = usePerformanceData();
  const competition = useCompetitionData();
  const { metrics: customMetrics } = useCustomMetrics();

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
    profile?.trackedCompetitionMetrics ?? COMPETITION_METRICS.map((m) => m.id);

  return (
    <div className={css.pluginShell}>
      <PluginSignOutBar />
      <h1 className={css.heading}>DataGOAT in CODAP</h1>
      <CodapExportPanel
        health={{
          entries: health.status === "loaded" ? health.entries : [],
          loading: profileLoading || health.status === "loading",
        }}
        performance={{
          entries:
            performance.status === "loaded" ? performance.entries : [],
          loading: profileLoading || performance.status === "loading",
        }}
        competition={{
          entries:
            competition.status === "loaded" ? competition.entries : [],
          loading: profileLoading || competition.status === "loading",
        }}
        trackedHealth={trackedHealth}
        trackedPerformance={trackedPerformance}
        trackedCompetition={trackedCompetition}
        customMetrics={customMetrics}
      />
    </div>
  );
}
```

- [ ] **Step 6: Add `CodapPluginDemo` and the demo branch in `CodapPlugin`**

Add the demo component (place it just below `CodapPluginAuthed`):

```tsx
// Demo variant: rendered when the plugin loads with ?demo. Bypasses all
// auth/profile gates and feeds the shared export panel synthetic entries
// (no Firestore, no sign-in). All built-in metrics per category; no
// custom metrics (there is no profile in demo mode).
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
      <p className={css.statusText} role="status">
        Demo data - generated sample entries, not saved.
      </p>
      <CodapExportPanel
        health={{ entries: healthEntries, loading: false }}
        performance={{ entries: performanceEntries, loading: false }}
        competition={{ entries: competitionEntries, loading: false }}
        trackedHealth={HEALTH_METRICS.map((m) => m.id)}
        trackedPerformance={PERFORMANCE_METRICS.map((m) => m.id)}
        trackedCompetition={COMPETITION_METRICS.map((m) => m.id)}
        customMetrics={[]}
      />
    </div>
  );
}
```

Update the top-level `CodapPlugin` (lines 36-56) to call `useDemoMode()` and `useAuth()` unconditionally, then branch to demo before the auth gates:

```tsx
export default function CodapPlugin() {
  const demoMode = useDemoMode();
  const { user, loading, isEmailVerifiedOrTrusted } = useAuth();

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
```

- [ ] **Step 7: Run the full CodapPlugin test file**

Run: `npm test -- src/codap/CodapPlugin.test.tsx`
Expected: PASS — all existing tests plus the new demo-branch test. The `sendDataset` attribute/row assertions in the existing "forwards selected datasets" test must still match exactly (the panel's `handleSend` is byte-for-byte the same logic).

- [ ] **Step 8: Typecheck**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
printf '%s\n' \
  'feat(dgt-77): export demo data from /codap?demo [DGT-77]' \
  '' \
  'Extract the export UI into a shared CodapExportPanel and add a' \
  'CodapPluginDemo branch that short-circuits before the auth gates,' \
  'feeding the panel generated entries (all built-in metrics, no' \
  'Firestore). CodapPlugin now reads useDemoMode() to select the branch.' \
  '' \
  'Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>' \
  > /tmp/dgt77-t3.txt
git add src/codap/CodapPlugin.tsx src/codap/CodapPlugin.test.tsx
git commit -F /tmp/dgt77-t3.txt
```

---

### Task 4: Runtime verification of the full flow

**Files:** none (manual verification).

This task confirms the one integration risk from the spec: that CODAP preserves the `?demo` query on the `di=` value when it loads the plugin iframe. Unit tests cannot cover this.

- [ ] **Step 1: Start the dev server against staging cloud (avoids emulator setup)**

Run: `npm run dev:staging`
(Or `npm run dev` with emulators running.)

- [ ] **Step 2: Open the dashboard in demo mode**

Navigate to `http://localhost:5173/dashboard?demo`. Confirm charts render populated demo data (existing behavior).

- [ ] **Step 3: Click through to CODAP**

Click the "Analyze Your Data in CODAP" button. A new tab opens at `codap3.concord.org?di=http://localhost:5173/codap?demo`.

- [ ] **Step 4: Confirm the demo export panel loads without sign-in**

Expected: the plugin iframe shows "DataGOAT in CODAP", the "Demo data - generated sample entries, not saved." notice, and Health/Performance/Competition checkboxes each reading "(30 entries)" - with NO sign-in prompt.

If instead the sign-in panel appears, CODAP stripped the query string from the `di` value. Remediation: URL-encode the `di` value in `buildCodapWrappedUrl` (e.g. `?di=${encodeURIComponent(`${diOrigin()}/codap${demo ? "?demo" : ""}`)}`) and re-verify. Confirm the non-demo path still works after encoding (the existing `codapUrl.test.ts` expectations would need updating to the encoded form).

- [ ] **Step 5: Send to CODAP**

Click "Send to CODAP". Expected: three tables (Health, Performance, Competition) appear in CODAP, each with a `date` column plus metric columns and ~30 rows of populated + occasionally-empty cells.

- [ ] **Step 6: Report the result**

Note whether Step 4 passed as-is or required the encoding remediation, so the outcome is recorded for the PR.

---

## Notes for the implementer

- Do not refactor the dashboard charts onto `demoEntries` - explicitly out of scope (see spec "Out of scope").
- `readHealthField` and `readBagField` stay module-level in `CodapPlugin.tsx`; both the panel's `handleSend` and (conceptually) the demo path reference them there. No new export is required.
- The `<If>` component convention applies to any NEW conditional JSX you introduce, but the moved JSX preserves its existing `{cond && ...}` form to keep the diff a pure extraction; do not rewrite those inline conditionals as part of this task.
