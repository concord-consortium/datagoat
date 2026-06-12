// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { SortableMetricRow } from "./SortableMetricRow";

function renderRow(
  isCustom: boolean,
  type: "health" | "performance" | "competition" = "health",
  checked = true,
  id = "leanMass",
  name = "Lean Mass",
) {
  return render(
    <MemoryRouter>
      <DndContext>
        <SortableContext items={[id]}>
          <table>
            <tbody>
              <SortableMetricRow
                id={id}
                name={name}
                type={type}
                checked={checked}
                onToggleCheck={vi.fn()}
                reorderHintId="hint"
                isCustom={isCustom}
              />
            </tbody>
          </table>
        </SortableContext>
      </DndContext>
    </MemoryRouter>,
  );
}

describe("SortableMetricRow edit pencil", () => {
  it("renders an Edit link for a built-in metric row", () => {
    renderRow(false);
    const link = screen.getByRole("link", { name: "Edit Lean Mass" });
    expect(link).toHaveAttribute("href", "/add-metric/health/leanMass");
  });

  it("renders an Edit link for a custom metric row", () => {
    renderRow(true);
    expect(
      screen.getByRole("link", { name: "Edit Lean Mass" }),
    ).toHaveAttribute("href", "/add-metric/health/leanMass");
  });

  it("renders an Edit link for a performance metric row when tracked", () => {
    renderRow(false, "performance", true, "fortyYardDash", "40-Yard Dash");
    const link = screen.getByRole("link", { name: "Edit 40-Yard Dash" });
    expect(link).toHaveAttribute(
      "href",
      "/add-metric/performance/fortyYardDash",
    );
  });

  it("does not render an Edit link for an unchecked (untracked) row", () => {
    renderRow(false, "health", false);
    expect(screen.queryByRole("link", { name: /^Edit / })).toBeNull();
  });
});

describe("SortableMetricRow definition link", () => {
  it("renders the metric name as a link to the metric's definition", () => {
    renderRow(false);
    const link = screen.getByRole("link", { name: "Lean Mass" });
    expect(link).toHaveAttribute("href", "/health/leanMass");
  });
});
