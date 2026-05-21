# DGT-61 — Support Performance Metrics Fully — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring performance metrics to parity with health and competition — enable custom-performance authoring, enable built-in-performance goal/axis overrides, and add per-perf chart configs.

**Architecture:** Four small "gate flips" + one new helper in `metricChartConfig.ts` + 19 per-metric CONFIG entries + one copy update in `metricGoals.ts`. No new abstractions, no schema changes, no data migration.

**Tech Stack:** React 19 + TypeScript + Vite, Vitest for tests, Firebase Firestore (no schema impact).

**Spec:** `specs/DGT-61-support-performance-metrics-fully.md`

**Branch:** `DGT-61-perf-metrics-first-class` (already created from `main` at commit `ec35e56`)

---

## File Structure

Each file gets one focused change. No restructuring; existing patterns followed throughout.

**Source files modified:**
- `src/charts/metricChartConfig.ts` — add `performanceConfig` helper + 19 CONFIG entries (Task 1)
- `src/components/tracking/AddMetric.tsx` — widen route guard (Task 2)
- `src/components/tracking/CustomMetricForm.tsx` — widen `isAuthorableType`, extend auto-track switch, extend built-ins gateway lookup (Tasks 3, 6)
- `src/components/tracking/TrackedDataSetup.tsx` — drop `addToComingSoon` from perf section (Task 4)
- `src/components/tracking/TrackedMetricsTable.tsx` — delete unused `addToComingSoon` prop (Task 4)
- `src/components/tracking/SortableMetricRow.tsx` — drop perf clause from edit-pencil `<If>` (Task 5)
- `src/data/metricGoals.ts` — update perf goal-text hint (Task 7)

**Test files modified:**
- `src/charts/metricChartConfig.test.ts` (Task 1)
- `src/components/tracking/AddMetric.test.tsx` (Task 2)
- `src/components/tracking/CustomMetricForm.test.tsx` (Tasks 3, 6)
- `src/components/tracking/TrackedDataSetup.test.tsx` (Task 4)
- `src/components/tracking/SortableMetricRow.test.tsx` (Task 5)
- `src/components/tracking/MetricOverrideForm.test.tsx` (Task 7)

No new files. No deletions.

---

### Task 1: Add `performanceConfig` helper + 19 CONFIG entries

**Files:**
- Modify: `src/charts/metricChartConfig.ts`
- Test: `src/charts/metricChartConfig.test.ts`

- [ ] **Step 1: Add failing tests for three representative perf metrics**

Append the following block to the end of `src/charts/metricChartConfig.test.ts` (before the last closing brace if file ends with a `describe` — otherwise at top level):

```typescript
describe("getMetricChartConfig — performance built-ins", () => {
  it("returns from-sheet bounds for fortyYardDash with sec unit", () => {
    const c = getMetricChartConfig("fortyYardDash");
    expect(c.chartType).toBe("bar");
    expect(c.yBottomRaw).toBe(4.2);
    expect(c.yTopRaw).toBe(10);
    expect(c.unit).toBe("sec");
    expect(c.inverted).toBeFalsy();
    // Time metrics: ascending axis, goal sits low on the chart.
  });

  it("returns guesstimate bounds for oneRepMaxBench with kg unit", () => {
    const c = getMetricChartConfig("oneRepMaxBench");
    expect(c.yBottomRaw).toBe(0);
    expect(c.yTopRaw).toBe(250);
    expect(c.unit).toBe("kg");
  });

  it("returns unitless bounds for reactiveStrengthIndex (no unit)", () => {
    const c = getMetricChartConfig("reactiveStrengthIndex");
    expect(c.yBottomRaw).toBe(0);
    expect(c.yTopRaw).toBe(5);
    expect(c.unit).toBeUndefined();
  });

  it("formats perf values without a unit suffix (unit appended by chart)", () => {
    const c = getMetricChartConfig("oneMileRun");
    expect(c.formatValue(4.5)).toBe("4.5");
    expect(c.unit).toBe("min");
  });
});
```

- [ ] **Step 2: Run the new tests and confirm they fail**

Run: `npx vitest run src/charts/metricChartConfig.test.ts`
Expected: 4 failures, e.g., `expect(c.yBottomRaw).toBe(4.2)` → `received: 0`. The failures should reference `DEFAULT_CONFIG`'s 100/0 bounds, confirming perf metrics currently fall through to the default.

- [ ] **Step 3: Add the `performanceConfig` helper and 19 CONFIG entries**

In `src/charts/metricChartConfig.ts`, locate the existing `competitionConfig` function (around line 157). Immediately after the `WINNING_PERCENTAGE` constant block (around line 184, just before `const CONFIG: Record<string, MetricChartConfig> = {`), insert:

```typescript
// Performance metrics — per-metric chart bounds for the 19 built-ins
// in ADDABLE_PERFORMANCE. yBottom/yTop carry one of two provenances:
//
//   "from sheet" — bounds derived from the DGT-51 spreadsheet's
//     "Estimated Range (Physiological)" column. Six metrics qualify.
//   "guesstimate" — no sheet value; bounds picked during DGT-61 and
//     flagged for content-team review. Thirteen metrics qualify.
//
// All authored ascending (yBottom < yTop) regardless of "lower is
// better" semantics. Time-based metrics (mile run, sprints) keep the
// goal line low on the chart — bars get shorter as the athlete
// improves, matching an athlete's mental model. The override form's
// existing baseAscending check ends up "always ascending" for perf.
//
// Unit choice for ambiguous-unit metrics (kg/lbs, m/s/mph, m/mi,
// in/cm): we pick one canonical unit per metric. Stored entry values
// remain unit-agnostic raw numbers; the unit string here affects only
// chart tooltips and axis labels.
function performanceConfig(
  yBottomRaw: number,
  yTopRaw: number,
  unit?: string,
): MetricChartConfig {
  return {
    chartType: "bar",
    yTopRaw,
    yBottomRaw,
    // No goalRaw — perf goals are user-set per the DGT-51 sheet.
    formatValue: fmtRaw,
    unit,
    // randomFloat (rather than randomInt) — perf ranges include
    // non-integer bounds (e.g. fortyYardDash 4.2..10). Rounded to 1
    // decimal so demo values match the chart's typical avgDecimals.
    random: (rng) => randomFloat(rng, yBottomRaw, yTopRaw, 1),
  };
}
```

Then, inside the existing `const CONFIG: Record<string, MetricChartConfig> = { … }` object (around line 186–201), append after the last competition entry (`times: competitionConfig(0, 60, "min"),`) and before the closing `};`:

```typescript
  // Performance — from sheet
  oneMileRun: performanceConfig(4, 15, "min"),               // from sheet
  tenMeterSprint: performanceConfig(1, 3, "sec"),            // from sheet
  fortyYardDash: performanceConfig(4.2, 10, "sec"),          // from sheet
  beepTest: performanceConfig(1, 21, "levels"),              // from sheet
  standingBroadJump: performanceConfig(100, 350, "cm"),      // from sheet
  verticalJump: performanceConfig(1, 50, "in"),              // from sheet
  // Performance — guesstimate (content team to confirm)
  oneRepMaxBench: performanceConfig(0, 250, "kg"),           // guesstimate
  oneRepMaxDeadlift: performanceConfig(0, 300, "kg"),        // guesstimate
  oneRepMaxHangClean: performanceConfig(0, 200, "kg"),       // guesstimate
  oneRepMaxPowerClean: performanceConfig(0, 200, "kg"),      // guesstimate
  oneRepMaxSquat: performanceConfig(0, 300, "kg"),           // guesstimate
  averageVelocity: performanceConfig(0, 15, "m/s"),          // guesstimate
  deceleration: performanceConfig(0, 15, "m/s"),             // guesstimate
  distance: performanceConfig(0, 20, "mi"),                  // guesstimate
  forwardAcceleration: performanceConfig(0, 15, "m/s"),      // guesstimate
  heartRateZone: performanceConfig(50, 200, "bpm"),          // guesstimate
  peakVelocity: performanceConfig(0, 15, "m/s"),             // guesstimate
  reactiveStrengthIndex: performanceConfig(0, 5),            // guesstimate
  upwardAcceleration: performanceConfig(0, 15, "m/s"),       // guesstimate
```

- [ ] **Step 4: Run the new tests and confirm they pass**

Run: `npx vitest run src/charts/metricChartConfig.test.ts`
Expected: all tests in the file pass (the four new ones plus the pre-existing ones).

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npm test -- --run`
Expected: all tests pass. Pay particular attention to any chart or perf-log tests — the new CONFIG entries replace `DEFAULT_CONFIG` for perf metrics, which could shift y-axis assertions if any existed.

- [ ] **Step 6: Commit**

```bash
git add src/charts/metricChartConfig.ts src/charts/metricChartConfig.test.ts
git commit -m "feat(metrics): add per-perf chart configs with provenance markers [DGT-61]

19 performance metrics now resolve to real y-axis bounds via the new
performanceConfig helper instead of falling through to DEFAULT_CONFIG
(0..100). Six bounds derived from the DGT-51 sheet's
'Estimated Range (Physiological)' column; 13 are flagged 'guesstimate'
for content-team review.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Open `AddMetric` route guard for performance

**Files:**
- Modify: `src/components/tracking/AddMetric.tsx`
- Test: `src/components/tracking/AddMetric.test.tsx`

- [ ] **Step 1: Add failing tests for performance type**

Append the following inside the existing `describe("AddMetric (demo)", () => { … })` block in `src/components/tracking/AddMetric.test.tsx`, just before the closing `});`:

```typescript
  it("shows the empty-state hint for performance type", () => {
    harness("/add-metric/performance");
    expect(screen.getByText(/none yet/i)).toBeInTheDocument();
  });

  it("renders performance customs in the performance list", () => {
    harness("/add-metric/performance", [
      makePerfMetric("Sprint Drill"),
    ]);
    expect(screen.getByText("Sprint Drill")).toBeInTheDocument();
  });
```

Also update the `makeMetric` signature near the top of the file to accept `"performance"`, and add a sibling `makePerfMetric` helper. Replace:

```typescript
function makeMetric(
  name: string,
  metricType: "health" | "competition",
): CustomMetricDef {
```

with:

```typescript
function makeMetric(
  name: string,
  metricType: "health" | "performance" | "competition",
): CustomMetricDef {
```

And add immediately after `makeMetric`:

```typescript
function makePerfMetric(name: string): CustomMetricDef {
  return makeMetric(name, "performance");
}
```

- [ ] **Step 2: Run the new tests and confirm they fail**

Run: `npx vitest run src/components/tracking/AddMetric.test.tsx`
Expected: the two new tests fail because the route guard redirects perf away from the list page (no "none yet" / "Sprint Drill" rendered).

- [ ] **Step 3: Widen the route guard**

In `src/components/tracking/AddMetric.tsx`, replace lines 14–26 (the entire `AddMetric` function plus its comment block, lines 16–21):

```typescript
export function AddMetric() {
  const { type } = useParams<{ type: string }>();
  // TODO(DGT-51 follow-up): accept "performance" once CustomMetricForm
  // supports authoring performance customs. Until then, /add-metric/
  // performance bounces back to /setup/tracking — matching the disabled
  // 🚧 button there. CustomMetricForm itself also rejects "performance"
  // today, so a deep-link to /add-metric/performance/new would lead to
  // a broken flow if we accepted it here.
  if (type !== "health" && type !== "competition") {
    return <Navigate to="/setup/tracking" replace />;
  }
  return <AddMetricInner type={type} />;
}
```

with:

```typescript
export function AddMetric() {
  const { type } = useParams<{ type: string }>();
  if (type !== "health" && type !== "performance" && type !== "competition") {
    return <Navigate to="/setup/tracking" replace />;
  }
  return <AddMetricInner type={type} />;
}
```

And update the `AddMetricInner` signature one line below:

```typescript
function AddMetricInner({ type }: { type: "health" | "performance" | "competition" }) {
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/components/tracking/AddMetric.test.tsx`
Expected: all tests in the file pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/tracking/AddMetric.tsx src/components/tracking/AddMetric.test.tsx
git commit -m "feat(metrics): accept performance type in AddMetric route guard [DGT-61]

/add-metric/performance no longer bounces back to /setup/tracking.
The list page renders perf customs alongside the Create CTA, parallel
to health and competition.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Open `CustomMetricForm` for performance + extend auto-track switch

**Files:**
- Modify: `src/components/tracking/CustomMetricForm.tsx`
- Test: `src/components/tracking/CustomMetricForm.test.tsx`

- [ ] **Step 1: Update the userMock type at the top of the test file**

In `src/components/tracking/CustomMetricForm.test.tsx`, find the `userMock` `vi.hoisted` block (around lines 35–43) and update the `setTrackedMetrics` signature from:

```typescript
  setTrackedMetrics: vi.fn<
    (type: "health" | "competition", ids: string[]) => Promise<void>
  >(async () => {}),
```

to:

```typescript
  setTrackedMetrics: vi.fn<
    (type: "health" | "performance" | "competition", ids: string[]) => Promise<void>
  >(async () => {}),
```

- [ ] **Step 2: Add failing tests for perf authoring + auto-track**

Append the following new describe block at the very end of `src/components/tracking/CustomMetricForm.test.tsx` (after the existing `describe("CustomMetricForm (auto-track on create)", …)` block):

```typescript
describe("CustomMetricForm (performance)", () => {
  it("renders the form at /add-metric/performance/new instead of redirecting", () => {
    renderAt("/add-metric/performance/new");
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.queryByText(/back to tracking setup/i)).toBeNull();
  });

  it("saves a numeric perf metric and persists with metricType performance", async () => {
    const user = userEvent.setup();
    renderAt("/add-metric/performance/new");

    await user.type(screen.getByLabelText(/name/i), "Sprint Drill");
    await user.type(screen.getByLabelText(/unit/i), "sec");
    await user.clear(screen.getByLabelText(/goal/i));
    await user.type(screen.getByLabelText(/goal/i), "4.5");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText("back to tracking setup")).toBeInTheDocument();
    });
    expect(mockedSetDoc).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "Sprint Drill",
        metricType: "performance",
        unit: "sec",
        goalRaw: 4.5,
      }),
    );
  });

  it("auto-tracks the new perf metric id into trackedPerformanceMetrics on first profile create", async () => {
    userMock.updateProfile.mockClear();

    const user = userEvent.setup();
    renderAt("/add-metric/performance/new");

    await user.type(screen.getByLabelText(/name/i), "Sprint Drill");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(userMock.updateProfile).toHaveBeenCalled();
    });
    const call = userMock.updateProfile.mock.calls.at(-1)?.[0] as
      | { trackedPerformanceMetrics?: string[] }
      | undefined;
    expect(call?.trackedPerformanceMetrics).toEqual(
      expect.arrayContaining([expect.stringMatching(/^c_/)]),
    );
  });
});
```

- [ ] **Step 3: Run the new tests and confirm they fail**

Run: `npx vitest run src/components/tracking/CustomMetricForm.test.tsx`
Expected: the three new tests fail. The first asserts the form renders (today it redirects via `Navigate to="/setup/tracking"`); the other two never reach the assertion because the form doesn't mount.

- [ ] **Step 4: Widen `isAuthorableType` and rename `AuthorableCustomMetricType`**

In `src/components/tracking/CustomMetricForm.tsx`:

Replace lines 25–27 (the comment and type alias):

```typescript
// Authoring is not yet implemented for performance custom metrics, so
// the form's route guard, builder, and body all narrow to this subset.
type AuthorableCustomMetricType = "health" | "competition";
```

with:

```typescript
type AuthorableCustomMetricType = "health" | "performance" | "competition";
```

Replace `isAuthorableType` (lines 171–173):

```typescript
function isAuthorableType(t: string | undefined): t is AuthorableCustomMetricType {
  return t === "health" || t === "competition";
}
```

with:

```typescript
function isAuthorableType(t: string | undefined): t is AuthorableCustomMetricType {
  return t === "health" || t === "performance" || t === "competition";
}
```

- [ ] **Step 5: Extend the auto-track switch**

In the same file, locate the auto-track block inside `handleSubmit` (around lines 437–455). The current code:

```typescript
        const profile =
          loadState.status === "loaded" ? loadState.profile : null;
        const builtIns =
          type === "health" ? HEALTH_METRICS : COMPETITION_METRICS;
        const currentIds =
          (type === "health"
            ? profile?.trackedHealthMetrics
            : profile?.trackedCompetitionMetrics) ??
          builtIns.map((m) => m.id);
        const next = [...currentIds, def.id];
        if (!profile) {
          void updateProfile({
            [type === "health"
              ? "trackedHealthMetrics"
              : "trackedCompetitionMetrics"]: next,
          });
        } else {
          void setTrackedMetrics(type, next);
        }
```

Replace with:

```typescript
        const profile =
          loadState.status === "loaded" ? loadState.profile : null;
        const builtIns =
          type === "health"
            ? HEALTH_METRICS
            : type === "performance"
              ? PERFORMANCE_METRICS
              : COMPETITION_METRICS;
        const trackedField =
          type === "health"
            ? "trackedHealthMetrics"
            : type === "performance"
              ? "trackedPerformanceMetrics"
              : "trackedCompetitionMetrics";
        const currentIds =
          (type === "health"
            ? profile?.trackedHealthMetrics
            : type === "performance"
              ? profile?.trackedPerformanceMetrics
              : profile?.trackedCompetitionMetrics) ??
          builtIns.map((m) => m.id);
        const next = [...currentIds, def.id];
        if (!profile) {
          void updateProfile({ [trackedField]: next });
        } else {
          void setTrackedMetrics(type, next);
        }
```

Add the `PERFORMANCE_METRICS` import. In the existing import block at the top (around lines 7–9):

```typescript
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { COMPETITION_METRICS } from "../../metrics/competitionMetrics";
import { ADDABLE_HEALTH, ADDABLE_COMPETITION } from "../../metrics/addableMetrics";
```

Insert the new import keeping alphabetical order within named imports — competition stays, performance is added on its own line:

```typescript
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { COMPETITION_METRICS } from "../../metrics/competitionMetrics";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import { ADDABLE_HEALTH, ADDABLE_COMPETITION } from "../../metrics/addableMetrics";
```

(Performance also needs `ADDABLE_PERFORMANCE` for Task 6 — that import is added there to keep this commit focused.)

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run src/components/tracking/CustomMetricForm.test.tsx`
Expected: all tests in the file pass, including the three new perf tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/tracking/CustomMetricForm.tsx src/components/tracking/CustomMetricForm.test.tsx
git commit -m "feat(metrics): accept performance type in CustomMetricForm + auto-track switch [DGT-61]

isAuthorableType now accepts all three metric types. The auto-track
block extends from a binary health/competition switch to a three-way
switch covering trackedPerformanceMetrics (PERFORMANCE_METRICS is
empty, so the default falls back to the user's existing list or the
newly created id alone).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Drop `addToComingSoon` from perf section + remove unused prop

**Files:**
- Modify: `src/components/tracking/TrackedDataSetup.tsx`
- Modify: `src/components/tracking/TrackedMetricsTable.tsx`
- Test: `src/components/tracking/TrackedDataSetup.test.tsx`

- [ ] **Step 1: Add failing test for live perf CTA**

In `src/components/tracking/TrackedDataSetup.test.tsx`, add the following two tests inside the existing `describe("TrackedDataSetup — custom-metric integration", …)` block. Place them just after the existing competition-CTA test (around line 118), so all three CTAs are tested in sequence:

```typescript
  it("renders the performance CTA at /add-metric/performance/new as a live link", () => {
    renderWith();
    const cta = screen.getByRole("link", {
      name: /^add performance metric$/i,
    });
    expect(cta).toHaveAttribute("href", "/add-metric/performance/new");
    // Sanity: the 🚧 emoji and 'coming soon' affordance are gone.
    expect(cta.textContent).not.toMatch(/🚧/);
  });

  it("does not render a disabled 'coming soon' performance button", () => {
    renderWith();
    expect(
      screen.queryByRole("button", { name: /add performance metric/i }),
    ).toBeNull();
  });
```

- [ ] **Step 2: Run the new tests and confirm they fail**

Run: `npx vitest run src/components/tracking/TrackedDataSetup.test.tsx`
Expected: both new tests fail. The first because the perf "Add" affordance is currently a `<button disabled>` (not a link); the second because it currently *is* a button.

- [ ] **Step 3: Drop `addToComingSoon` from the perf section in `TrackedDataSetup`**

In `src/components/tracking/TrackedDataSetup.tsx`, locate the perf `TrackedMetricsTable` block (around lines 205–218). Replace:

```typescript
      <TrackedMetricsTable
        type="performance"
        heading="Performance Log"
        registry={performanceRegistry}
        customIds={customPerformanceIds}
        trackedIds={performanceIds}
        onChangeOrder={(ids) => void handleChangeOrder("performance", ids)}
        onToggleCheck={(id, checked) =>
          void handleToggleCheck("performance", id, checked)
        }
        addToHref="/add-metric/performance/new"
        addToLabel="🚧 Add Performance Metric"
        addToComingSoon
      />
```

with:

```typescript
      <TrackedMetricsTable
        type="performance"
        heading="Performance Log"
        registry={performanceRegistry}
        customIds={customPerformanceIds}
        trackedIds={performanceIds}
        onChangeOrder={(ids) => void handleChangeOrder("performance", ids)}
        onToggleCheck={(id, checked) =>
          void handleToggleCheck("performance", id, checked)
        }
        addToHref="/add-metric/performance/new"
        addToLabel="Add Performance Metric"
      />
```

(Two changes: the 🚧 is dropped from `addToLabel`, and the `addToComingSoon` prop is removed.)

- [ ] **Step 4: Delete the now-unused `addToComingSoon` prop from `TrackedMetricsTable`**

In `src/components/tracking/TrackedMetricsTable.tsx`:

Remove the prop declaration (lines 49–52):

```typescript
  // When true, the Add control renders as a non-interactive disabled
  // affordance instead of a Link. Used for the Performance section
  // until custom-metric creation supports the performance type.
  addToComingSoon?: boolean;
```

Remove the destructured default (line 64):

```typescript
  addToComingSoon = false,
```

Replace the conditional rendering at the bottom (lines 186–206):

```typescript
      {addToComingSoon ? (
        // Real <button disabled> so SR/keyboard users perceive the
        // "coming soon" affordance as a disabled control. A <span>
        // with aria-disabled has no semantic effect; the button
        // semantics make the state announced and unfocusable for
        // free.
        <button
          type="button"
          disabled
          className={`${css.addMeasurementBtn} ${css.addMeasurementBtnDisabled}`}
          title="Coming soon"
        >
          <PlusCircleIcon />
          {addToLabel}
        </button>
      ) : (
        <Link to={addToHref} className={css.addMeasurementBtn}>
          <PlusCircleIcon />
          {addToLabel}
        </Link>
      )}
```

with:

```typescript
      <Link to={addToHref} className={css.addMeasurementBtn}>
        <PlusCircleIcon />
        {addToLabel}
      </Link>
```

Check the CSS module `src/components/tracking/TrackedMetricsTable.module.css` for an `.addMeasurementBtnDisabled` rule. If it exists, delete it (no remaining consumers). Run `grep -n "addMeasurementBtnDisabled" src/` to confirm zero references before deleting.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/components/tracking/TrackedDataSetup.test.tsx`
Expected: the two new tests pass.

- [ ] **Step 6: Run the full suite to catch unused-import / dead-code warnings**

Run: `npm test -- --run`
Expected: all pass. Watch for any TS error in `TrackedMetricsTable.tsx` for the now-unused `addToComingSoon` reference or imports that became unused.

- [ ] **Step 7: Commit**

```bash
git add src/components/tracking/TrackedDataSetup.tsx src/components/tracking/TrackedMetricsTable.tsx src/components/tracking/TrackedMetricsTable.module.css src/components/tracking/TrackedDataSetup.test.tsx
git commit -m "feat(metrics): drop 'coming soon' affordance from perf Add button [DGT-61]

Performance now has a live 'Add Performance Metric' link parallel to
health and competition. The addToComingSoon prop on
TrackedMetricsTable is removed entirely (YAGNI — no remaining
consumer). The disabled-button CSS rule is dropped if present.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Drop perf gate on `SortableMetricRow` edit pencil

**Files:**
- Modify: `src/components/tracking/SortableMetricRow.tsx`
- Test: `src/components/tracking/SortableMetricRow.test.tsx`

- [ ] **Step 1: Flip the existing perf-suppression test to a positive assertion**

In `src/components/tracking/SortableMetricRow.test.tsx`, replace the existing test (lines 51–54):

```typescript
  it("does not render an Edit link for a performance metric row", () => {
    renderRow(false, "performance");
    expect(screen.queryByRole("link", { name: /^Edit / })).toBeNull();
  });
```

with:

```typescript
  it("renders an Edit link for a performance metric row when tracked", () => {
    renderRow(false, "performance");
    const link = screen.getByRole("link", { name: "Edit Lean Mass" });
    expect(link).toHaveAttribute("href", "/add-metric/performance/leanMass");
  });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/components/tracking/SortableMetricRow.test.tsx`
Expected: the flipped test fails (today the perf row suppresses the edit link).

- [ ] **Step 3: Drop the perf clause from the edit-pencil `<If>`**

In `src/components/tracking/SortableMetricRow.tsx`:

Replace the comment block + If (lines 91–106):

```typescript
        {/* Edit-pencil cell: links to the metric's edit form (custom
            metrics open CustomMetricForm, built-ins open
            MetricOverrideForm). Shown only for tracked (checked)
            metrics - editing a goal/axis is meaningless for a metric
            the user isn't tracking. Suppressed for performance metrics
            too - performance editing is not supported, so the route
            would dead-end back to /setup/tracking. */}
        <If condition={checked && type !== "performance"}>
          <Link
            to={`/add-metric/${type}/${id}`}
            className={css.metricInfoBtn}
            aria-label={`Edit ${name}`}
          >
            ✏︎
          </Link>
        </If>
```

with:

```typescript
        {/* Edit-pencil cell: links to the metric's edit form (custom
            metrics open CustomMetricForm, built-ins open
            MetricOverrideForm). Shown only for tracked (checked)
            metrics — editing a goal/axis is meaningless for a metric
            the user isn't tracking. */}
        <If condition={checked}>
          <Link
            to={`/add-metric/${type}/${id}`}
            className={css.metricInfoBtn}
            aria-label={`Edit ${name}`}
          >
            ✏︎
          </Link>
        </If>
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/components/tracking/SortableMetricRow.test.tsx`
Expected: all four tests pass (the renamed perf test plus the three pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/components/tracking/SortableMetricRow.tsx src/components/tracking/SortableMetricRow.test.tsx
git commit -m "feat(metrics): show edit pencil on tracked performance rows [DGT-61]

Drops the type !== 'performance' clause that DGT-48 added to suppress
the pencil while the override route dead-ended. The CustomMetricForm
gateway gains perf routing in the next commit; this commit reveals
the affordance so the route works end-to-end.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Route built-in perf overrides through `CustomMetricForm` gateway

**Files:**
- Modify: `src/components/tracking/CustomMetricForm.tsx`
- Test: `src/components/tracking/CustomMetricForm.test.tsx`

- [ ] **Step 1: Add failing test for built-in perf routing**

Append the following test inside the `describe("CustomMetricForm (performance)", …)` block added in Task 3 (place after the existing perf tests, before the block's closing `});`):

```typescript
  it("routes a built-in perf metric id (oneRepMaxBench) to MetricOverrideForm", () => {
    renderAt("/add-metric/performance/oneRepMaxBench");
    // MetricOverrideForm shows Name and Unit fields disabled; the
    // unit ("kg") comes from the Task 1 CONFIG entry.
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByLabelText("Unit")).toBeDisabled();
    expect(
      (screen.getByLabelText("Unit") as HTMLInputElement).value,
    ).toBe("kg or lbs"); // MetricDefinition.unit, NOT the CONFIG unit (which is displayUnit-style)
    // y-axis placeholders pull from the base CONFIG; expect the perf
    // bounds (0 and 250) rather than DEFAULT_CONFIG's 0/100.
    expect(
      (screen.getByLabelText(/^Y-axis top/) as HTMLInputElement).placeholder,
    ).toBe("250");
  });
```

(Note: `Unit` on `MetricOverrideForm` shows `metric.displayUnit ?? metric.unit`; for `oneRepMaxBench`, `MetricDefinition.unit` is `"kg or lbs"` and no `displayUnit` is set. The CONFIG's `"kg"` is for chart axis labels, not the form's read-only Unit input.)

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/components/tracking/CustomMetricForm.test.tsx`
Expected: the new test fails — the gateway's built-ins ternary doesn't include perf, so `oneRepMaxBench` falls through to `getMetric(metricId)`, finds nothing, and `Navigate to="/setup/tracking"` fires.

- [ ] **Step 3: Add the `ADDABLE_PERFORMANCE` import + `PERFORMANCE_METRICS` import (if not already added in Task 3)**

In `src/components/tracking/CustomMetricForm.tsx`, update the addable imports (around line 9):

```typescript
import { ADDABLE_HEALTH, ADDABLE_COMPETITION } from "../../metrics/addableMetrics";
```

to:

```typescript
import {
  ADDABLE_HEALTH,
  ADDABLE_PERFORMANCE,
  ADDABLE_COMPETITION,
} from "../../metrics/addableMetrics";
```

(Confirm `PERFORMANCE_METRICS` from `../../metrics/performanceMetrics` is already imported from Task 3.)

- [ ] **Step 4: Extend the built-ins lookup to a switch covering perf**

In the same file, locate the gateway's built-ins lookup (around lines 222–229):

```typescript
    const builtIns =
      type === "health"
        ? [...HEALTH_METRICS, ...ADDABLE_HEALTH]
        : [...COMPETITION_METRICS, ...ADDABLE_COMPETITION];
```

Replace with:

```typescript
    const builtIns =
      type === "health"
        ? [...HEALTH_METRICS, ...ADDABLE_HEALTH]
        : type === "performance"
          ? [...PERFORMANCE_METRICS, ...ADDABLE_PERFORMANCE]
          : [...COMPETITION_METRICS, ...ADDABLE_COMPETITION];
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run src/components/tracking/CustomMetricForm.test.tsx`
Expected: all tests in the file pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/tracking/CustomMetricForm.tsx src/components/tracking/CustomMetricForm.test.tsx
git commit -m "feat(metrics): route built-in perf overrides via CustomMetricForm gateway [DGT-61]

Visiting /add-metric/performance/{builtinId} now resolves the metric
from PERFORMANCE_METRICS + ADDABLE_PERFORMANCE and hands it to
MetricOverrideForm, matching the existing health/competition behavior.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Update perf goal-text hint + add perf override-form test

**Files:**
- Modify: `src/data/metricGoals.ts`
- Test: `src/components/tracking/MetricOverrideForm.test.tsx`

- [ ] **Step 1: Add failing test for the new hint + perf-metric form behavior**

In `src/components/tracking/MetricOverrideForm.test.tsx`, add an import for a perf metric near the existing `HEALTH_METRICS` import (line 46). Replace:

```typescript
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
```

with:

```typescript
import { HEALTH_METRICS } from "../../metrics/healthMetrics";
import { ADDABLE_PERFORMANCE } from "../../metrics/addableMetrics";
```

Add a perf-metric reference near the existing `leanMass` / `hydration` lines (around line 50):

```typescript
const fortyYardDash = ADDABLE_PERFORMANCE.find((m) => m.id === "fortyYardDash")!;
```

Append the following describe block at the end of the file, just before the very last closing `});`:

```typescript
describe("MetricOverrideForm — performance metric", () => {
  beforeEach(() => {
    navigateSpy.mockClear();
  });

  it("renders the personal-target hint for perf metrics", () => {
    renderForm(fortyYardDash);
    expect(
      screen.getByText(/performance goals are personal/i),
    ).toBeInTheDocument();
    // Negative: the previous "🚧 Personalized goal coming soon" copy
    // must not appear.
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it("uses the perf CONFIG bounds as y-axis placeholders", () => {
    renderForm(fortyYardDash);
    // fortyYardDash: from-sheet bounds 4.2..10 (sec).
    expect(
      (screen.getByLabelText(/^Y-axis top/) as HTMLInputElement).placeholder,
    ).toBe("10");
    expect(
      (screen.getByLabelText(/^Y-axis bottom/) as HTMLInputElement).placeholder,
    ).toBe("4.2");
  });

  it("saves a valid perf override and navigates back", async () => {
    renderForm(fortyYardDash);
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "4.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith("/setup/tracking"),
    );
  });
});
```

- [ ] **Step 2: Run the new tests and confirm they fail**

Run: `npx vitest run src/components/tracking/MetricOverrideForm.test.tsx`
Expected: the first new test fails (today's text is "🚧 Personalized goal coming soon"). The other two should pass — they exercise the CONFIG entries added in Task 1 and the override save path, which already works after Task 6.

- [ ] **Step 3: Update the perf branch of `resolveGoalText`**

In `src/data/metricGoals.ts`, locate the `PERFORMANCE_IDS` branch in `resolveGoalText` (lines 89–94):

```typescript
  if (PERFORMANCE_IDS.has(metricId)) {
    // Per-gender × athlete-type goals for Performance metrics are
    // defined in the DGT-51 design source but not yet wired through.
    // Make the gap visible at the MetricDetail page.
    return "🚧 Personalized goal coming soon";
  }
```

Replace with:

```typescript
  if (PERFORMANCE_IDS.has(metricId)) {
    // Per DGT-51, all 19 perf metrics are marked "user sets their
    // own goal" — no canonical per-profile recommendations exist.
    // The form's Goal input is the answer.
    return "Performance goals are personal — enter your target.";
  }
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/components/tracking/MetricOverrideForm.test.tsx`
Expected: all tests pass.

- [ ] **Step 5: Run the full suite for a final regression check**

Run: `npm test -- --run`
Expected: all tests pass across the project.

- [ ] **Step 6: Commit**

```bash
git add src/data/metricGoals.ts src/components/tracking/MetricOverrideForm.test.tsx
git commit -m "feat(metrics): personal-target hint for perf overrides [DGT-61]

Replaces the construction-emoji 'coming soon' string with a
personal-target message that matches the DGT-51 sheet's 'user sets
their own goal' stance for all 19 perf metrics.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Manual verification + PR

**Files:** No source changes.

- [ ] **Step 1: Build + type-check**

Run: `npm run build`
Expected: build completes with no TypeScript errors.

- [ ] **Step 2: Manual smoke test against emulators**

In one terminal: `npm run emulators`
In another: `npm run dev`

Open http://localhost:5173. Sign in (or use an existing test account).

Verify each of these flows in the browser:

1. **Tracking-setup page** (`/setup/tracking`): the Performance section's "Add Performance Metric" button is a live link (no 🚧, no disabled appearance).
2. **Custom perf authoring**: click "Add Performance Metric" → enter a name + goal + numeric type → Save. The new metric appears in the Performance section's tracked list.
3. **Built-in perf override**: on a tracked built-in perf metric (e.g., 40-Yard Dash if you've added it via the perf customs/built-ins flow), click the edit pencil. The override form opens; the goal-text hint reads "Performance goals are personal — enter your target." The y-axis placeholders show the CONFIG values (e.g., "10" / "4.2" for 40-Yard Dash). Save a goal of 4.5 → returns to /setup/tracking → reopening the form shows the saved value.
4. **Categorical / Y/N perf authoring**: create a perf metric with type "Categorical" (2+ levels) and another with type "Y/N". Both save without errors.

Type-checking and the test suite verify code correctness, not feature correctness. If something feels off during manual testing, fix it before opening the PR.

- [ ] **Step 3: Push the branch and open the PR**

Run: `git push -u origin DGT-61-perf-metrics-first-class`

Then create the PR (replace `<DGT-48-PR-NUMBER>` with the actual number if you want to reference it; check `gh pr list --state merged --search "DGT-48"`):

```bash
gh pr create --title "[DGT-61] Support performance metrics fully" --body "$(cat <<'EOF'
## Summary

- Brings perf metrics to parity: custom authoring works, built-in goal/axis overrides work, charts get sensible y-axis bounds.
- Four small "gate flips" across `CustomMetricForm`, `AddMetric`, `TrackedDataSetup`, and `SortableMetricRow` — no new abstractions.
- New `performanceConfig` helper + 19 CONFIG entries in `metricChartConfig.ts`. Six bounds derived from the DGT-51 spreadsheet's "Estimated Range (Physiological)" column; **13 are flagged `guesstimate` and need content-team review** (see file comments).
- Goal-text hint for perf overrides now reads "Performance goals are personal — enter your target." — matching the DGT-51 sheet's stance that all 19 perf metrics are user-set.
- Removes the now-unused `addToComingSoon` prop from `TrackedMetricsTable`.
- Spec: [`specs/DGT-61-support-performance-metrics-fully.md`](specs/DGT-61-support-performance-metrics-fully.md)
- Follow-up to DGT-36 (custom metrics) and DGT-48 (metric overrides).

## For content review

Thirteen perf metrics have y-axis bounds I guesstimated (flagged inline in `src/charts/metricChartConfig.ts`). Bench/deadlift/squat 1RM ranges, velocities, deceleration, distance, HR zone, RSI, and upward acceleration — please confirm or revise.

## Test plan

- [ ] `npm test` passes (Vitest)
- [ ] `npm run build` succeeds with no TS errors
- [ ] In emulators: "Add Performance Metric" CTA is a live link, not the old 🚧 disabled affordance
- [ ] In emulators: create a custom perf metric (Numeric, Categorical, Y/N each) — each saves and appears in the Performance section
- [ ] In emulators: open the edit pencil on a tracked built-in perf metric (e.g., 40-Yard Dash) — override form opens with the new hint text and CONFIG-derived placeholders; save a goal value and reload to confirm persistence
- [ ] In emulators: confirm tracking-setup setup-completion gate still flips correctly when visiting /setup/tracking with a complete profile

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Update the Jira ticket**

Move DGT-61 to "In Code Review" (transition ID 6) via the `/jira status DGT-61 In Code Review` skill command. Confirm the Developer Approver (Doug Martin) is set before the transition; the skill prompts if it isn't.

---

## Spec coverage check

Verifying each spec requirement maps to a task:

| Spec requirement | Task |
|---|---|
| §1 Authoring gates — `CustomMetricForm` `isAuthorableType` widening + comment cleanup | Task 3 |
| §1 Authoring gates — `AddMetric` route guard widening + TODO comment cleanup | Task 2 |
| §1 Authoring gates — `TrackedDataSetup` drop 🚧 + drop `addToComingSoon` | Task 4 |
| §1 Authoring gates — `TrackedMetricsTable` drop unused `addToComingSoon` prop | Task 4 |
| §2 Override path — `SortableMetricRow` drop perf clause + comment cleanup | Task 5 |
| §2 Override path — `CustomMetricForm` gateway built-ins switch | Task 6 |
| §3 Per-perf CONFIG entries — helper + 19 entries + provenance comments | Task 1 |
| §3 Per-perf CONFIG entries — bounds table | Task 1 (table reproduced in commit body) |
| §3 Per-perf CONFIG entries — axis direction (ascending) | Task 1 (helper enforces) |
| §3 Per-perf CONFIG entries — unit canonicalization | Task 1 |
| §4 Goal-text hint — `metricGoals.ts` `PERFORMANCE_IDS` branch update | Task 7 |
| §5 Auto-track on creation — three-way switch | Task 3 |
| §6 Tests — `CustomMetricForm.test.tsx` perf authoring smoke + auto-track | Task 3 |
| §6 Tests — `MetricOverrideForm.test.tsx` perf override test | Task 7 |
| §6 Tests — `AddMetric.test.tsx` flip perf-redirect to perf-renders | Task 2 |
| §6 Tests — `TrackedDataSetup.test.tsx` remove disabled assertion, add positive | Task 4 |
| §6 Tests — `SortableMetricRow.test.tsx` flip perf-suppress to perf-renders | Task 5 |
| §6 Tests — `metricChartConfig.test.ts` perf bounds spot-check | Task 1 |
| §7 Risk / migration — none | Task 8 (manual verification) |

All spec requirements covered.
