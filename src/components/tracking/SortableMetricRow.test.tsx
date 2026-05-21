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
) {
  return render(
    <MemoryRouter>
      <DndContext>
        <SortableContext items={["leanMass"]}>
          <table>
            <tbody>
              <SortableMetricRow
                id="leanMass"
                name="Lean Mass"
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
    renderRow(false, "performance");
    const link = screen.getByRole("link", { name: "Edit Lean Mass" });
    expect(link).toHaveAttribute("href", "/add-metric/performance/leanMass");
  });

  it("does not render an Edit link for an unchecked (untracked) row", () => {
    renderRow(false, "health", false);
    expect(screen.queryByRole("link", { name: /^Edit / })).toBeNull();
  });
});
