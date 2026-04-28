import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import PlusCircleIcon from "@/icons/plus-circle.svg?react";
import EditIcon from "@/icons/edit.svg?react";
import { SortableMetricRow } from "./SortableMetricRow";
import { makeAnnouncements } from "./announcements";
import type { MetricDefinition } from "../../metrics/types";
import css from "./TrackedMetricsTable.module.css";

interface TrackedMetricsTableProps {
  type: "wellness" | "performance";
  heading: string;
  // The full registry for this type. We persist an explicit user-ordered
  // list of ids; metrics not in the user's list still render here when
  // they're in the registry but unchecked, so the user can toggle them.
  registry: MetricDefinition[];
  // The user's tracked-metric ordering for this type.
  trackedIds: string[];
  // Edit mode toggles the column-del cell + drag handles + delete buttons.
  editing: boolean;
  onToggleEdit: () => void;
  onChangeOrder: (ids: string[]) => void;
  onToggleCheck: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  addToHref: string;
  addToLabel: string;
}

export function TrackedMetricsTable({
  type,
  heading,
  registry,
  trackedIds,
  editing,
  onToggleEdit,
  onChangeOrder,
  onToggleCheck,
  onDelete,
  addToHref,
  addToLabel,
}: TrackedMetricsTableProps) {
  // Display order: any metric in trackedIds first (in user-chosen order),
  // followed by registry metrics not yet in the tracked list (so the user
  // can check them on without an extra "add" trip). The drag-reorder UI
  // sorts the union to match the prototype's behaviour.
  const orderedRows = useMemo(() => {
    const map = new Map(registry.map((m) => [m.id, m]));
    const seen = new Set<string>();
    const rows: MetricDefinition[] = [];
    for (const id of trackedIds) {
      const def = map.get(id);
      if (def && !seen.has(id)) {
        rows.push(def);
        seen.add(id);
      }
    }
    for (const def of registry) {
      if (!seen.has(def.id)) {
        rows.push(def);
      }
    }
    return rows;
  }, [registry, trackedIds]);

  const sortableIds = useMemo(() => orderedRows.map((m) => m.id), [orderedRows]);

  // KeyboardSensor.keyboardCodes override is load-bearing for the
  // requirements a11y contract: Space + Enter both pick up / drop, Escape
  // cancels. Don't strip Enter - keyboard users habitually press Enter on
  // focusable controls and would hit a dead key without it.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: ["Space", "Enter"],
        cancel: ["Escape"],
        end: ["Space", "Enter"],
      },
    }),
  );

  const announcements = makeAnnouncements(
    (id) => orderedRows.find((m) => m.id === id)?.name ?? id,
    () => orderedRows.length,
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    // Reorder the tracked list. Untracked metrics keep their order at the
    // tail; we splice only across the union and then filter to the
    // currently-tracked ids preserving order.
    const newOrder = arrayMove(sortableIds, oldIndex, newIndex);
    const trackedSet = new Set(trackedIds);
    onChangeOrder(newOrder.filter((id) => trackedSet.has(id)));
  }

  return (
    <>
      <h3 className={css.infoSectionHeading}>
        {heading}
        <button
          type="button"
          className={`${css.editToggleBtn} ${editing ? css.editToggleBtnActive : ""}`}
          aria-label={editing ? "Done editing metrics" : "Edit metrics"}
          aria-pressed={editing}
          onClick={onToggleEdit}
        >
          <EditIcon />
        </button>
      </h3>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{ announcements }}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          <table
            className={`${css.dataTable} ${editing ? css.editMode : ""}`}
          >
            <thead>
              <tr>
                <th className={css.colDrag}></th>
                <th>
                  <span className={css.trackLabel}>Track</span>
                </th>
                <th>Metric</th>
                <th>Info</th>
                <th className={css.colDel}></th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.map((m) => (
                <SortableMetricRow
                  key={m.id}
                  id={m.id}
                  name={m.name}
                  type={type}
                  editing={editing}
                  checked={trackedIds.includes(m.id)}
                  onToggleCheck={() =>
                    onToggleCheck(m.id, !trackedIds.includes(m.id))
                  }
                  onDelete={() => onDelete(m.id)}
                />
              ))}
            </tbody>
          </table>
        </SortableContext>
      </DndContext>
      <Link to={addToHref} className={css.addMeasurementBtn}>
        <PlusCircleIcon />
        {addToLabel}
      </Link>
    </>
  );
}
