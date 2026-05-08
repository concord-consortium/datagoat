# DGT-36 Custom Metrics — UI Demo Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a demo-ready custom-metrics UI flow — user clicks "+ Create custom metric," fills a form, sees the new metric appear in their list of custom metrics on the AddMetric page. State lives in React only; metrics disappear on reload. The hook surface mirrors the eventual Firestore-backed implementation. No persistence and no backend wiring in this slice.

**Architecture:** A `CustomMetricsContext` holds definitions in React state and exposes `useCustomMetrics()` (signature matches the eventual production hook so the swap is one-file). A `CustomMetricForm` component handles both create and edit. The AddMetric page replaces its 10 placeholder rows with a "+ Create" CTA at top + a list of the user's customs (with edit/delete affordances).

**Tech Stack:** React 19, TypeScript, Vite, CSS Modules, react-router-dom v6, Vitest + React Testing Library.

**Out of scope for this plan (deferred to next plan):** Firestore wiring; integration with TrackedMetricsTable / Dashboard / MetricInputRow / chart engine; confirmation dialogs for data-impacting field edits when entries exist (no entries exist in this slice — no log-screen integration); MetricDetail page support for custom metrics.

**Demo loop this plan delivers:**
1. Navigate to `/add-metric/wellness` (or `/performance`)
2. Click "+ Create custom metric" → form
3. Fill in name, type, unit, goal, y-range → Save
4. Land back on `/add-metric/wellness`, see the new metric in the "Your custom metrics" section
5. Click ✏️ on a row → edit form prefilled → change name → Save → see updated name
6. Click 🗑️ on a row → confirm → row disappears

---

## Task 1: Type definition + ID minter

**Files:**
- Create: `src/types/customMetrics.ts`
- Create: `src/utils/customMetricId.ts`
- Create: `src/utils/customMetricId.test.ts`

- [ ] **Step 1: Write the type**

Create `src/types/customMetrics.ts`:

```ts
export type CustomMetricType = "wellness" | "performance";
export type CustomMetricInputType = "numeric" | "radio";

export interface CustomMetricDef {
  id: string;
  ownerId: string;
  name: string;
  metricType: CustomMetricType;
  inputType: CustomMetricInputType;
  unit: string;
  goalRaw: number;
  yTopRaw: number;
  yBottomRaw: number;
  avgDecimals: number;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Write the failing test for the ID minter**

Create `src/utils/customMetricId.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mintCustomMetricId } from "./customMetricId";

describe("mintCustomMetricId", () => {
  it("returns a string starting with 'c_'", () => {
    expect(mintCustomMetricId().startsWith("c_")).toBe(true);
  });

  it("produces unique values across many invocations", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(mintCustomMetricId());
    expect(ids.size).toBe(1000);
  });
});
```

- [ ] **Step 3: Run the test, expect failure**

Run: `npx vitest run src/utils/customMetricId.test.ts`
Expected: FAIL — `customMetricId` module not found.

- [ ] **Step 4: Implement the minter**

Create `src/utils/customMetricId.ts`:

```ts
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function mintCustomMetricId(): string {
  let suffix = "";
  for (let i = 0; i < 10; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `c_${suffix}`;
}
```

- [ ] **Step 5: Run the test, expect pass**

Run: `npx vitest run src/utils/customMetricId.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/types/customMetrics.ts src/utils/customMetricId.ts src/utils/customMetricId.test.ts
git commit -m "feat(metrics): CustomMetricDef type + ID minter [DGT-36]"
```

---

## Task 2: CustomMetricsContext (in-memory)

**Files:**
- Create: `src/contexts/CustomMetricsContext.tsx`
- Create: `src/contexts/CustomMetricsContext.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/contexts/CustomMetricsContext.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  CustomMetricsProvider,
  useCustomMetrics,
} from "./CustomMetricsContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CustomMetricsProvider>{children}</CustomMetricsProvider>
);

describe("CustomMetricsContext", () => {
  it("starts with no metrics", () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    expect(result.current.metrics).toEqual([]);
  });

  it("addMetric appends a new metric and returns it", () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let created!: ReturnType<typeof result.current.addMetric>;
    act(() => {
      created = result.current.addMetric({
        ownerId: "u1",
        name: "5K Time",
        metricType: "performance",
        inputType: "numeric",
        unit: "min",
        goalRaw: 25,
        yTopRaw: 40,
        yBottomRaw: 15,
        avgDecimals: 1,
      });
    });
    expect(created.id.startsWith("c_")).toBe(true);
    expect(result.current.metrics).toHaveLength(1);
    expect(result.current.metrics[0].name).toBe("5K Time");
  });

  it("updateMetric patches in place", () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let id = "";
    act(() => {
      id = result.current.addMetric({
        ownerId: "u1",
        name: "x",
        metricType: "wellness",
        inputType: "numeric",
        unit: "",
        goalRaw: 0,
        yTopRaw: 10,
        yBottomRaw: 0,
        avgDecimals: 1,
      }).id;
    });
    act(() => result.current.updateMetric(id, { name: "y" }));
    expect(result.current.metrics[0].name).toBe("y");
  });

  it("deleteMetric removes the metric", () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let id = "";
    act(() => {
      id = result.current.addMetric({
        ownerId: "u1",
        name: "x",
        metricType: "wellness",
        inputType: "numeric",
        unit: "",
        goalRaw: 0,
        yTopRaw: 10,
        yBottomRaw: 0,
        avgDecimals: 1,
      }).id;
    });
    act(() => result.current.deleteMetric(id));
    expect(result.current.metrics).toEqual([]);
  });

  it("accepts initialMetrics for test seeding", () => {
    const seed = [
      {
        id: "c_seed",
        ownerId: "u1",
        name: "seeded",
        metricType: "wellness" as const,
        inputType: "numeric" as const,
        unit: "",
        goalRaw: 0,
        yTopRaw: 10,
        yBottomRaw: 0,
        avgDecimals: 1,
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    const seededWrapper = ({ children }: { children: React.ReactNode }) => (
      <CustomMetricsProvider initialMetrics={seed}>{children}</CustomMetricsProvider>
    );
    const { result } = renderHook(() => useCustomMetrics(), {
      wrapper: seededWrapper,
    });
    expect(result.current.metrics).toEqual(seed);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `npx vitest run src/contexts/CustomMetricsContext.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the provider + hook**

Create `src/contexts/CustomMetricsContext.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CustomMetricDef } from "../types/customMetrics";
import { mintCustomMetricId } from "../utils/customMetricId";

interface CustomMetricsValue {
  metrics: CustomMetricDef[];
  addMetric: (
    input: Omit<CustomMetricDef, "id" | "createdAt" | "updatedAt">,
  ) => CustomMetricDef;
  updateMetric: (id: string, patch: Partial<Omit<CustomMetricDef, "id">>) => void;
  deleteMetric: (id: string) => void;
  getMetric: (id: string) => CustomMetricDef | undefined;
}

const CustomMetricsContext = createContext<CustomMetricsValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  // Test seam — pre-seeds the in-memory list. Production callers omit this.
  initialMetrics?: CustomMetricDef[];
}

export function CustomMetricsProvider({ children, initialMetrics }: ProviderProps) {
  const [metrics, setMetrics] = useState<CustomMetricDef[]>(initialMetrics ?? []);

  const addMetric = useCallback<CustomMetricsValue["addMetric"]>((input) => {
    const now = Date.now();
    const def: CustomMetricDef = {
      ...input,
      id: mintCustomMetricId(),
      createdAt: now,
      updatedAt: now,
    };
    setMetrics((prev) => [...prev, def]);
    return def;
  }, []);

  const updateMetric = useCallback<CustomMetricsValue["updateMetric"]>(
    (id, patch) => {
      const now = Date.now();
      setMetrics((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: now } : m)),
      );
    },
    [],
  );

  const deleteMetric = useCallback<CustomMetricsValue["deleteMetric"]>((id) => {
    setMetrics((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const value = useMemo<CustomMetricsValue>(
    () => ({
      metrics,
      addMetric,
      updateMetric,
      deleteMetric,
      getMetric: (id) => metrics.find((m) => m.id === id),
    }),
    [metrics, addMetric, updateMetric, deleteMetric],
  );

  return (
    <CustomMetricsContext.Provider value={value}>
      {children}
    </CustomMetricsContext.Provider>
  );
}

export function useCustomMetrics(): CustomMetricsValue {
  const ctx = useContext(CustomMetricsContext);
  if (!ctx) {
    throw new Error("useCustomMetrics must be used within CustomMetricsProvider");
  }
  return ctx;
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `npx vitest run src/contexts/CustomMetricsContext.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Wire the provider in App.tsx**

Modify `src/App.tsx` — add `CustomMetricsProvider` inside `UserProvider`:

```tsx
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { UserProvider } from "./contexts/UserContext";
import { DataProvider } from "./contexts/DataContext";
import { DemoModeProvider } from "./contexts/DemoModeContext";
import { CustomMetricsProvider } from "./contexts/CustomMetricsContext";
import { AppRoutes } from "./routes/AppRoutes";
import css from "./App.module.css";

export const APP_VERSION = "v0.1.0";
export const APP_VERSION_DESC = "Prototype-to-React conversion";

export default function App() {
  return (
    <div className={css.app}>
      <BrowserRouter>
        <DemoModeProvider>
          <AuthProvider>
            <UserProvider>
              <CustomMetricsProvider>
                <DataProvider>
                  <AppRoutes />
                </DataProvider>
              </CustomMetricsProvider>
            </UserProvider>
          </AuthProvider>
        </DemoModeProvider>
      </BrowserRouter>
    </div>
  );
}
```

- [ ] **Step 6: Run the full test suite to ensure nothing else broke**

Run: `npm test -- --run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/contexts/CustomMetricsContext.tsx src/contexts/CustomMetricsContext.test.tsx src/App.tsx
git commit -m "feat(metrics): in-memory CustomMetricsContext [DGT-36]"
```

---

## Task 3: CustomMetricForm component

**Files:**
- Create: `src/components/tracking/CustomMetricForm.tsx`
- Create: `src/components/tracking/CustomMetricForm.module.css`
- Create: `src/components/tracking/CustomMetricForm.test.tsx`

- [ ] **Step 1: Write the failing test for create flow**

Create `src/components/tracking/CustomMetricForm.test.tsx`:

```tsx
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  CustomMetricsProvider,
  useCustomMetrics,
} from "../../contexts/CustomMetricsContext";
import type { CustomMetricDef } from "../../types/customMetrics";
import { CustomMetricForm } from "./CustomMetricForm";

// Probe component that mirrors the latest metrics list into a captured
// array for test assertions. Uses useEffect to avoid render-phase side
// effects.
function CaptureMetrics({ into }: { into: { current: CustomMetricDef[] } }) {
  const { metrics } = useCustomMetrics();
  useEffect(() => {
    into.current = metrics;
  }, [metrics, into]);
  return null;
}

function renderAt(path: string, into?: { current: CustomMetricDef[] }) {
  return render(
    <CustomMetricsProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/add-metric/:type/new" element={<CustomMetricForm />} />
          <Route path="/add-metric/:type/:metricId" element={<CustomMetricForm />} />
          <Route path="/add-metric/:type" element={<div>back to list</div>} />
        </Routes>
      </MemoryRouter>
      {into && <CaptureMetrics into={into} />}
    </CustomMetricsProvider>,
  );
}

describe("CustomMetricForm (create)", () => {
  it("requires a name", async () => {
    const user = userEvent.setup();
    renderAt("/add-metric/wellness/new");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });

  it("saves a numeric metric on submit and navigates back", async () => {
    const user = userEvent.setup();
    const captured: { current: CustomMetricDef[] } = { current: [] };
    renderAt("/add-metric/wellness/new", captured);

    await user.type(screen.getByLabelText(/name/i), "Stretch Minutes");
    await user.type(screen.getByLabelText(/unit/i), "min");
    await user.clear(screen.getByLabelText(/goal/i));
    await user.type(screen.getByLabelText(/goal/i), "15");
    await user.clear(screen.getByLabelText(/y-axis top/i));
    await user.type(screen.getByLabelText(/y-axis top/i), "60");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText("back to list")).toBeInTheDocument();
    });
    expect(captured.current).toHaveLength(1);
    expect(captured.current[0].name).toBe("Stretch Minutes");
    expect(captured.current[0].metricType).toBe("wellness");
    expect(captured.current[0].unit).toBe("min");
    expect(captured.current[0].goalRaw).toBe(15);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `npx vitest run src/components/tracking/CustomMetricForm.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the form component**

Create `src/components/tracking/CustomMetricForm.module.css`:

```css
.form {
  padding: 20px 24px 100px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 420px;
  margin: 0 auto;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--subtext);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.input,
.select {
  appearance: none;
  -webkit-appearance: none;
  font-family: inherit;
  font-size: 16px;
  padding: 10px 12px;
  border: 1.5px solid var(--border);
  border-radius: 6px;
  background: white;
  color: var(--text);
}

.input:focus-visible,
.select:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  border-color: var(--accent);
}

.row {
  display: flex;
  gap: 12px;
}

.row .field {
  flex: 1;
}

.error {
  color: #dc3545;
  font-size: 14px;
  margin: 0;
}

.actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.primary,
.secondary,
.danger {
  appearance: none;
  -webkit-appearance: none;
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  padding: 10px 18px;
  border-radius: 6px;
  cursor: pointer;
  flex: 1;
  background: #f5f5f5;
  border: 1px solid var(--border);
  color: #0693e3;
}

.primary {
  background: var(--accent, #0693e3);
  border-color: var(--accent, #0693e3);
  color: white;
}

.danger {
  border-color: rgba(220, 53, 69, 0.75);
  color: #dc3545;
  background: white;
}

.danger:hover {
  background: rgba(220, 53, 69, 0.08);
}
```

Create `src/components/tracking/CustomMetricForm.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import type {
  CustomMetricInputType,
  CustomMetricType,
} from "../../types/customMetrics";
import css from "./CustomMetricForm.module.css";

const NAME_MAX = 128;
// Demo slice: in-memory state doesn't need a real owner. The next
// plan replaces this with the auth UID when wiring Firestore.
const DEMO_OWNER_ID = "demo-user";

function isValidType(t: string | undefined): t is CustomMetricType {
  return t === "wellness" || t === "performance";
}

interface DraftState {
  name: string;
  inputType: CustomMetricInputType;
  unit: string;
  goalRaw: string;
  yTopRaw: string;
  yBottomRaw: string;
  avgDecimals: string;
}

const EMPTY_DRAFT: DraftState = {
  name: "",
  inputType: "numeric",
  unit: "",
  goalRaw: "0",
  yTopRaw: "10",
  yBottomRaw: "0",
  avgDecimals: "1",
};

export function CustomMetricForm() {
  const { type, metricId } = useParams<{ type: string; metricId?: string }>();
  const navigate = useNavigate();
  const { addMetric, updateMetric, deleteMetric, getMetric } = useCustomMetrics();

  // Hooks must run unconditionally — compute editing in render, but do
  // NOT early-return before useState. React's Rules of Hooks require
  // the same hook calls every render.
  const editing = metricId ? getMetric(metricId) : undefined;

  const [draft, setDraft] = useState<DraftState>(() =>
    editing
      ? {
          name: editing.name,
          inputType: editing.inputType,
          unit: editing.unit,
          goalRaw: String(editing.goalRaw),
          yTopRaw: String(editing.yTopRaw),
          yBottomRaw: String(editing.yBottomRaw),
          avgDecimals: String(editing.avgDecimals),
        }
      : EMPTY_DRAFT,
  );
  const [error, setError] = useState<string | null>(null);

  // Conditional returns are safe AFTER all hooks are declared.
  if (!isValidType(type)) {
    return <Navigate to="/setup/tracking" replace />;
  }
  if (metricId && !editing) {
    return <Navigate to={`/add-metric/${type}`} replace />;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = draft.name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (trimmed.length > NAME_MAX) {
      setError(`Name must be ${NAME_MAX} characters or fewer.`);
      return;
    }
    const goalRaw = Number(draft.goalRaw);
    const yTopRaw = Number(draft.yTopRaw);
    const yBottomRaw = Number(draft.yBottomRaw);
    const avgDecimals = Number(draft.avgDecimals);
    if ([goalRaw, yTopRaw, yBottomRaw, avgDecimals].some((v) => Number.isNaN(v))) {
      setError("Goal, y-axis top/bottom, and decimals must be numbers.");
      return;
    }
    if (yBottomRaw >= yTopRaw) {
      setError("Y-axis top must be greater than y-axis bottom.");
      return;
    }

    if (editing) {
      updateMetric(editing.id, {
        name: trimmed,
        inputType: draft.inputType,
        unit: draft.unit.trim(),
        goalRaw,
        yTopRaw,
        yBottomRaw,
        avgDecimals,
      });
    } else {
      addMetric({
        ownerId: DEMO_OWNER_ID,
        name: trimmed,
        metricType: type,
        inputType: draft.inputType,
        unit: draft.unit.trim(),
        goalRaw,
        yTopRaw,
        yBottomRaw,
        avgDecimals,
      });
    }
    navigate(`/add-metric/${type}`);
  }

  function handleDelete() {
    if (!editing) return;
    if (!window.confirm(`Delete "${editing.name}"? Past entries become invisible.`)) {
      return;
    }
    deleteMetric(editing.id);
    navigate(`/add-metric/${type}`);
  }

  function update<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form className={css.form} onSubmit={handleSubmit} noValidate>
      <div className={css.field}>
        <label className={css.label} htmlFor="cm-name">Name</label>
        <input
          id="cm-name"
          className={css.input}
          type="text"
          value={draft.name}
          maxLength={NAME_MAX}
          onChange={(e) => update("name", e.target.value)}
          autoFocus
        />
      </div>

      <div className={css.field}>
        <label className={css.label} htmlFor="cm-type">Input type</label>
        <select
          id="cm-type"
          className={css.select}
          value={draft.inputType}
          onChange={(e) => update("inputType", e.target.value as CustomMetricInputType)}
        >
          <option value="numeric">Numeric</option>
          <option value="radio">Yes / No</option>
        </select>
      </div>

      <div className={css.field}>
        <label className={css.label} htmlFor="cm-unit">Unit (optional)</label>
        <input
          id="cm-unit"
          className={css.input}
          type="text"
          value={draft.unit}
          onChange={(e) => update("unit", e.target.value)}
        />
      </div>

      <div className={css.field}>
        <label className={css.label} htmlFor="cm-goal">Goal</label>
        <input
          id="cm-goal"
          className={css.input}
          type="number"
          inputMode="decimal"
          value={draft.goalRaw}
          onChange={(e) => update("goalRaw", e.target.value)}
        />
      </div>

      <div className={css.row}>
        <div className={css.field}>
          <label className={css.label} htmlFor="cm-ytop">Y-axis top</label>
          <input
            id="cm-ytop"
            className={css.input}
            type="number"
            inputMode="decimal"
            value={draft.yTopRaw}
            onChange={(e) => update("yTopRaw", e.target.value)}
          />
        </div>
        <div className={css.field}>
          <label className={css.label} htmlFor="cm-ybot">Y-axis bottom</label>
          <input
            id="cm-ybot"
            className={css.input}
            type="number"
            inputMode="decimal"
            value={draft.yBottomRaw}
            onChange={(e) => update("yBottomRaw", e.target.value)}
          />
        </div>
      </div>

      <div className={css.field}>
        <label className={css.label} htmlFor="cm-dec">Decimals</label>
        <input
          id="cm-dec"
          className={css.input}
          type="number"
          inputMode="numeric"
          value={draft.avgDecimals}
          onChange={(e) => update("avgDecimals", e.target.value)}
        />
      </div>

      {error && <p className={css.error}>{error}</p>}

      <div className={css.actions}>
        <button type="button" className={css.secondary} onClick={() => navigate(`/add-metric/${type}`)}>
          Cancel
        </button>
        {editing && (
          <button type="button" className={css.danger} onClick={handleDelete}>
            Delete
          </button>
        )}
        <button type="submit" className={css.primary}>
          Save
        </button>
      </div>
    </form>
  );
}
```

Note: `loadState.profile.uid` is referenced as the ownerId source. If `UserProfile` does not expose a `uid` field, the `?? "demo-user"` fallback ensures the form still works for the demo. (Production wiring will swap to the auth UID directly.)

- [ ] **Step 4: Run the test, expect pass**

Run: `npx vitest run src/components/tracking/CustomMetricForm.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/tracking/CustomMetricForm.tsx src/components/tracking/CustomMetricForm.module.css src/components/tracking/CustomMetricForm.test.tsx
git commit -m "feat(metrics): CustomMetricForm component for create + edit [DGT-36]"
```

---

## Task 4: Routes + AddMetric page integration

**Files:**
- Modify: `src/routes/AppRoutes.tsx`
- Modify: `src/components/tracking/AddMetric.tsx`
- Modify: `src/components/tracking/AddMetric.module.css`
- Modify: `src/components/tracking/AddMetric.test.tsx`

- [ ] **Step 1: Add the new routes**

Modify `src/routes/AppRoutes.tsx` — add the two custom-metric routes inside `<Route element={<ProtectedRoute />}>` block, placed BEFORE the existing `/add-metric/:type` route so static segments (`/new`) and explicit IDs are matched first:

```tsx
import { CustomMetricForm } from "../components/tracking/CustomMetricForm";
```

Then in the route tree:

```tsx
<Route path="/add-metric/:type/new" element={<CustomMetricForm />} />
<Route path="/add-metric/:type/:metricId" element={<CustomMetricForm />} />
<Route path="/add-metric/:type" element={<AddMetric />} />
```

(react-router-dom v6 ranks routes; the order above is defensive but redundant. Keep it explicit so the tree reads top-down.)

- [ ] **Step 2: Add CSS for the new sections**

Modify `src/components/tracking/AddMetric.module.css` — append:

```css
/* Custom-metric section header + CTA */

.sectionHead {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--subtext);
  margin: 24px 0 8px;
}

.createCta {
  appearance: none;
  -webkit-appearance: none;
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  width: 100%;
  padding: 14px 16px;
  background: rgba(0, 179, 192, 0.08);
  border: 1.5px dashed var(--accent, #0693e3);
  border-radius: 8px;
  color: var(--accent, #0693e3);
  cursor: pointer;
  text-align: left;
  margin-bottom: 16px;
}

.createCta:hover {
  background: rgba(0, 179, 192, 0.14);
}

.createCta:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.editBtn {
  width: 44px;
  height: 44px;
  padding: 0;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1.5px solid var(--border);
  border-radius: 6px;
  color: var(--subtext);
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  font-family: inherit;
  font-size: 18px;
}

.editBtn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.editBtn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.emptyHint {
  font-style: italic;
  color: var(--subtext);
  padding: 8px;
}
```

- [ ] **Step 3: Rewrite the AddMetric component**

Replace `src/components/tracking/AddMetric.tsx` entirely:

```tsx
import { Link, Navigate, useParams } from "react-router-dom";
import { useUser } from "../../contexts/UserContext";
import { useCustomMetrics } from "../../contexts/CustomMetricsContext";
import { WELLNESS_METRICS } from "../../metrics/wellnessMetrics";
import { PERFORMANCE_METRICS } from "../../metrics/performanceMetrics";
import type { CustomMetricDef } from "../../types/customMetrics";
import CustomMetricIcon from "@/icons/custom-metric.svg?react";
import css from "./AddMetric.module.css";

// AddMetric (rewritten for DGT-36 demo slice). Lists the user's
// custom metrics for the current type ("wellness" | "performance"),
// with a "+ Create custom metric" CTA at the top. Built-in metric
// browsing is intentionally removed here — built-ins are managed
// from the tracked-metrics setup screen.
export function AddMetric() {
  const { type } = useParams<{ type: string }>();
  if (type !== "wellness" && type !== "performance") {
    return <Navigate to="/setup/tracking" replace />;
  }
  return <AddMetricInner type={type} />;
}

function AddMetricInner({ type }: { type: "wellness" | "performance" }) {
  const { loadState, updateProfile, setTrackedMetrics } = useUser();
  const { metrics: allCustom } = useCustomMetrics();
  const profile = loadState.status === "loaded" ? loadState.profile : null;

  const customForType = allCustom.filter((m) => m.metricType === type);

  const builtIn = type === "wellness" ? WELLNESS_METRICS : PERFORMANCE_METRICS;
  const trackedKey =
    type === "wellness" ? "trackedWellnessMetrics" : "trackedPerformanceMetrics";
  const trackedIds = profile?.[trackedKey] ?? builtIn.map((m) => m.id);

  async function handleToggleTracked(metric: CustomMetricDef) {
    const isTracked = trackedIds.includes(metric.id);
    const next = isTracked
      ? trackedIds.filter((id) => id !== metric.id)
      : [...trackedIds, metric.id];

    if (!profile) {
      await updateProfile({ [trackedKey]: next });
      return;
    }
    await setTrackedMetrics(type, next);
  }

  return (
    <div className={css.addMetricScreen}>
      <Link to={`/add-metric/${type}/new`} className={css.createCta}>
        + Create custom metric
      </Link>

      <h2 className={css.sectionHead}>Your custom {type} metrics</h2>

      {customForType.length === 0 ? (
        <p className={css.emptyHint}>None yet. Create one above to get started.</p>
      ) : (
        <ul className={css.addMetricList}>
          {customForType.map((m) => {
            const tracked = trackedIds.includes(m.id);
            return (
              <li key={m.id}>
                <span className={css.metricNameCol}>
                  <CustomMetricIcon
                    style={{
                      width: 20,
                      height: 20,
                      verticalAlign: "middle",
                      marginRight: 8,
                    }}
                    aria-hidden="true"
                  />
                  {m.name}
                </span>
                <Link
                  to={`/add-metric/${type}/${m.id}`}
                  className={css.editBtn}
                  aria-label={`Edit ${m.name}`}
                >
                  ✏︎
                </Link>
                <button
                  type="button"
                  className={tracked ? css.removeBtn : css.addBtn}
                  aria-label={tracked ? `Untrack ${m.name}` : `Track ${m.name}`}
                  onClick={() => void handleToggleTracked(m)}
                >
                  {tracked ? "−" : "+"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update existing AddMetric tests**

The current `AddMetric.test.tsx` references the deleted placeholder rows. Replace its contents — pass `initialMetrics` to the provider for seeded scenarios:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CustomMetricsProvider } from "../../contexts/CustomMetricsContext";
import type { CustomMetricDef } from "../../types/customMetrics";
import { AddMetric } from "./AddMetric";

function makeMetric(
  name: string,
  metricType: "wellness" | "performance",
): CustomMetricDef {
  return {
    id: `c_test_${name.replace(/\s/g, "_")}`,
    ownerId: "u1",
    name,
    metricType,
    inputType: "numeric",
    unit: "",
    goalRaw: 0,
    yTopRaw: 10,
    yBottomRaw: 0,
    avgDecimals: 1,
    createdAt: 0,
    updatedAt: 0,
  };
}

function harness(path: string, seed: CustomMetricDef[] = []) {
  return render(
    <CustomMetricsProvider initialMetrics={seed}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/add-metric/:type" element={<AddMetric />} />
        </Routes>
      </MemoryRouter>
    </CustomMetricsProvider>,
  );
}

describe("AddMetric (demo)", () => {
  it("shows the empty-state hint when no customs exist", () => {
    harness("/add-metric/wellness");
    expect(screen.getByText(/none yet/i)).toBeInTheDocument();
  });

  it("renders user customs of the current type only", () => {
    harness("/add-metric/wellness", [
      makeMetric("Stretch Time", "wellness"),
      makeMetric("5K Time", "performance"),
    ]);
    expect(screen.getByText("Stretch Time")).toBeInTheDocument();
    expect(screen.queryByText("5K Time")).toBeNull();
  });

  it("always shows the + Create CTA", () => {
    harness("/add-metric/performance");
    expect(screen.getByRole("link", { name: /create custom metric/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run all tests**

Run: `npm test -- --run`
Expected: all tests pass (including the rewritten AddMetric tests + the new context/form tests).

- [ ] **Step 6: Manual smoke test in the dev server**

```bash
# In one terminal:
npm run emulators
# In another:
npm run dev
```

Open `http://localhost:5173/add-metric/wellness` after signing in. Verify:
- "+ Create custom metric" CTA visible
- "None yet" hint shown initially
- Click CTA → form appears at `/add-metric/wellness/new`
- Fill in name + values → Save → land back on `/add-metric/wellness` with the new metric in the list
- Click ✏︎ → form prefilled → change name → Save → list updates
- Click 🗑️ via the form's Delete button → confirm → metric disappears
- (Note: a page refresh clears all custom metrics — in-memory only, by design for the demo slice)

- [ ] **Step 7: Commit**

```bash
git add src/routes/AppRoutes.tsx src/components/tracking/AddMetric.tsx src/components/tracking/AddMetric.module.css src/components/tracking/AddMetric.test.tsx
git commit -m "feat(metrics): wire CustomMetricForm route + AddMetric page CTA [DGT-36]"
```

---

## Demo-ready checkpoint

After Task 4 commits, the demo loop above is fully exercisable. The next plan picks up:

- Replace in-memory state with Firestore-backed persistence (`metricDefinitions/{id}` collection + security rules + `useCustomMetrics` rewrite — same hook signature, different innards)
- Make custom metrics appear in TrackedMetricsTable on `/setup/tracking`
- Wire custom metrics into the dashboard, log screens, and chart engine (registry merge at `getMetricChartConfig`, `lookupGoalLine`, `readWellnessMetric`)
- Confirmation dialogs for `inputType` / `metricType` / `unit` edits when entries exist
- MetricDetail page support for custom metrics
- Drop the `addableMetrics.ts` placeholder file
