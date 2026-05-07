import type { Announcements } from "@dnd-kit/core";

// SR narration of pickup / over / dropped / cancelled events for the
// keyboard-drag flow. Per requirements: KeyboardSensor + announcements is
// the load-bearing a11y contract for tracked-metric reorder.
//
// The sortable IDs are metric ids (e.g., "hydration"), and we look up the
// human-readable name via the registry.
export function makeAnnouncements(
  resolveName: (id: string) => string,
  totalItems: () => number,
): Announcements {
  return {
    onDragStart({ active }) {
      const idx = activeIndex(active);
      const total = totalItems();
      const name = resolveName(String(active.id));
      return `${name} picked up. Position ${idx + 1} of ${total}. Use arrow keys to move.`;
    },
    onDragOver({ active, over }) {
      const total = totalItems();
      const name = resolveName(String(active.id));
      if (over) {
        const targetIdx = activeIndex(over);
        return `${name} moving to position ${targetIdx + 1} of ${total}.`;
      }
      return `${name} no longer over a drop target.`;
    },
    onDragEnd({ active, over }) {
      const total = totalItems();
      const name = resolveName(String(active.id));
      if (over) {
        const targetIdx = activeIndex(over);
        return `${name} dropped at position ${targetIdx + 1} of ${total}.`;
      }
      return `${name} dropped.`;
    },
    onDragCancel({ active }) {
      const idx = activeIndex(active);
      const total = totalItems();
      const name = resolveName(String(active.id));
      return `Reorder cancelled, ${name} returned to position ${idx + 1} of ${total}.`;
    },
  };
}

interface DataWithSortable {
  data?: { current?: { sortable?: { index?: number } } };
}

function activeIndex(node: DataWithSortable): number {
  return node.data?.current?.sortable?.index ?? 0;
}
