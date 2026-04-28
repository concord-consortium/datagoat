import type { ReactElement } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

interface Options extends Omit<RenderOptions, "wrapper"> {
  initialEntries?: string[];
}

// Pinned router-mock pattern across the suite. Component tests that need
// routing context consume this rather than re-deriving the wrapper boilerplate.
// Tests that need to assert on `useNavigate` calls consume this plus a
// separate `vi.mock('react-router-dom', () => ...)` to capture navigate calls
// (don't double-mount or wrap in a real <BrowserRouter>).
export function renderWithRouter(
  ui: ReactElement,
  { initialEntries, ...options }: Options = {},
): RenderResult {
  return render(
    <MemoryRouter initialEntries={initialEntries ?? ["/"]}>
      <Routes>
        <Route path="*" element={ui} />
      </Routes>
    </MemoryRouter>,
    options,
  );
}
