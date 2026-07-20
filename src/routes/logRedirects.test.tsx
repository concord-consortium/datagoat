// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { LogPathRedirect } from "./LogPathRedirect";

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc">{`${loc.pathname}${loc.search}`}</div>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/health" element={<LogPathRedirect />} />
        <Route path="/performance" element={<LogPathRedirect />} />
        <Route path="/competition" element={<LogPathRedirect />} />
        <Route path="/log" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LogPathRedirect", () => {
  it("redirects /health to /log", () => {
    renderAt("/health");
    expect(screen.getByTestId("loc").textContent).toBe("/log");
  });

  it("redirects /performance to /log", () => {
    renderAt("/performance");
    expect(screen.getByTestId("loc").textContent).toBe("/log");
  });

  it("redirects /competition to /log", () => {
    renderAt("/competition");
    expect(screen.getByTestId("loc").textContent).toBe("/log");
  });

  it("preserves the ?date= query string", () => {
    // The activity calendar deep-links to /health?date=<iso>.
    renderAt("/health?date=2026-07-06");
    expect(screen.getByTestId("loc").textContent).toBe("/log?date=2026-07-06");
  });
});
