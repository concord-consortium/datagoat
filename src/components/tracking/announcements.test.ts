import { describe, it, expect } from "vitest";
import type { Active, DragCancelEvent, DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { makeAnnouncements } from "./announcements";

// Stub the minimal shape makeAnnouncements reads off Active / Over: an id
// plus data.current.sortable.index.
function node(id: string, index: number): Active {
  return {
    id,
    data: { current: { sortable: { index } } },
  } as unknown as Active;
}

const NAMES: Record<string, string> = {
  hydration: "Hydration",
  protein: "Protein",
};

function build(total = 3) {
  return makeAnnouncements(
    (id) => NAMES[id] ?? id,
    () => total,
  );
}

describe("makeAnnouncements", () => {
  it("onDragStart announces pickup with position and total", () => {
    const a = build(3);
    const msg = a.onDragStart!({
      active: node("hydration", 0),
    } as DragStartEvent);
    expect(msg).toBe(
      "Hydration picked up. Position 1 of 3. Use arrow keys to move.",
    );
  });

  it("onDragOver announces target position when over a drop target", () => {
    const a = build(3);
    const msg = a.onDragOver!({
      active: node("hydration", 0),
      over: node("protein", 2),
    } as unknown as DragOverEvent);
    expect(msg).toBe("Hydration moving to position 3 of 3.");
  });

  it("onDragOver announces leaving when not over a drop target", () => {
    const a = build(3);
    const msg = a.onDragOver!({
      active: node("hydration", 0),
      over: null,
    } as unknown as DragMoveEvent);
    expect(msg).toBe("Hydration no longer over a drop target.");
  });

  it("onDragEnd announces dropped with target position", () => {
    const a = build(3);
    const msg = a.onDragEnd!({
      active: node("hydration", 0),
      over: node("protein", 1),
    } as unknown as DragEndEvent);
    expect(msg).toBe("Hydration dropped at position 2 of 3.");
  });

  it("onDragEnd announces dropped without position when no drop target", () => {
    const a = build(3);
    const msg = a.onDragEnd!({
      active: node("hydration", 0),
      over: null,
    } as unknown as DragEndEvent);
    expect(msg).toBe("Hydration dropped.");
  });

  it("onDragCancel announces cancellation with origin position", () => {
    const a = build(3);
    const msg = a.onDragCancel!({
      active: node("hydration", 1),
    } as DragCancelEvent);
    expect(msg).toBe(
      "Reorder cancelled, Hydration returned to position 2 of 3.",
    );
  });

  it("falls back to id when name resolver returns the id itself", () => {
    const a = makeAnnouncements(
      (id) => id,
      () => 2,
    );
    const msg = a.onDragStart!({
      active: node("custom-id", 0),
    } as DragStartEvent);
    expect(msg).toBe(
      "custom-id picked up. Position 1 of 2. Use arrow keys to move.",
    );
  });

  it("defaults missing sortable index to 0", () => {
    const a = build(2);
    const bareNode = { id: "hydration", data: { current: {} } } as unknown as Active;
    const msg = a.onDragStart!({ active: bareNode } as DragStartEvent);
    expect(msg).toBe(
      "Hydration picked up. Position 1 of 2. Use arrow keys to move.",
    );
  });
});
