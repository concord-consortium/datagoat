// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { DemoModeProvider, useDemoMode } from "./DemoModeContext";

function ModeReadout() {
  const demoMode = useDemoMode();
  return <span data-testid="mode">{demoMode ? "demo" : "real"}</span>;
}

describe("DemoModeContext", () => {
  it("returns false when ?demo is not present at mount", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <DemoModeProvider>
          <ModeReadout />
        </DemoModeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("real");
  });

  it("returns true when the initial URL has ?demo", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard?demo"]}>
        <DemoModeProvider>
          <ModeReadout />
        </DemoModeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("demo");
  });

  it("stays on after navigating to a route without ?demo (sticky-on)", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/dashboard?demo"]}>
        <DemoModeProvider>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <>
                  <ModeReadout />
                  <Link to="/wellness">go</Link>
                </>
              }
            />
            <Route path="/wellness" element={<ModeReadout />} />
          </Routes>
        </DemoModeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("demo");
    await user.click(screen.getByText("go"));
    expect(screen.getByTestId("mode").textContent).toBe("demo");
  });
});
