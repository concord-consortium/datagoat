import { useId, useMemo } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
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
import { SortableMetricRow } from "./SortableMetricRow";
import { makeAnnouncements } from "./announcements";
import type { MetricDefinition } from "../../metrics/types";
import css from "./TrackedMetricsTable.module.css";
import common from "../common.module.css";

interface TrackedMetricsTableProps {
  type: "health" | "performance" | "competition";
  heading: string;
  // The full registry for this type. We persist an explicit user-ordered
  // list of ids; metrics not in the user's list still render here when
  // they're in the registry but unchecked, so the user can toggle them.
  // Caller may include user-defined custom metrics here (alongside
  // built-ins) and pass their ids in `customIds` so each custom row
  // gains an Edit-pencil cell linking to the create/edit form. The
  // Info cell remains in place for both built-ins and customs (custom
  // rows render the custom-metric icon as the Info-cell glyph).
  registry: MetricDefinition[];
  // Subset of `registry` ids that are user-defined custom metrics.
  // Drives the per-row Edit-pencil cell + custom-metric icon in the
  // Info cell; the Info-cell link target is the same as for built-ins.
  customIds?: ReadonlySet<string>;
  // The user's tracked-metric ordering for this type.
  trackedIds: string[];
  onChangeOrder: (ids: string[]) => void;
  onToggleCheck: (id: string, checked: boolean) => void;
  addToHref: string;
  addToLabel: string;
  // Drop the heading's top margin when no intro/welcome block precedes
  // this table (return users), so it doesn't leave an empty gap above
  // the title. Only the first table on a screen sets this.
  tightTop?: boolean;
}

export function TrackedMetricsTable({
  type,
  heading,
  registry,
  customIds,
  trackedIds,
  onChangeOrder,
  onToggleCheck,
  addToHref,
  addToLabel,
  tightTop = false,
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

  // Each drag handle aria-describedby's this hint so the same instructions
  // are spoken on focus. Sighted keyboard users see the visible paragraph;
  // SR users hear it on group entry and again on each handle focus.
  const reorderHintId = useId();

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
      <h2 className={clsx(css.infoSectionHeading, tightTop && css.tightTop)}>
        {heading}
      </h2>
      {/* Reorder instructions are kept in the DOM but visually hidden:
          the prompt was dropped from the visible UI per the design, while
          each drag handle still aria-describedby's this so keyboard / AT
          users hear the shortcut on focus. */}
      <p id={reorderHintId} className={common.visuallyHidden}>
        Drag the handle to reorder, or focus a handle and press Space, then
        use the arrow keys to move (Escape to cancel).
      </p>
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
          <table className={css.dataTable}>
            <thead>
              <tr>
                <th className={css.colDrag}></th>
                <th>
                  <span className={css.trackLabel}>Track</span>
                </th>
                <th>Metric</th>
                <th>
                  {/* Edit cell only renders for custom rows; the
                      visually-hidden text gives SR users a column
                      name without adding chrome for sighted users. */}
                  <span className={common.visuallyHidden}>Edit</span>
                </th>
                <th>Info</th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.map((m) => (
                <SortableMetricRow
                  key={m.id}
                  id={m.id}
                  name={m.name}
                  type={type}
                  Icon={m.Icon}
                  checked={trackedIds.includes(m.id)}
                  onToggleCheck={() =>
                    onToggleCheck(m.id, !trackedIds.includes(m.id))
                  }
                  reorderHintId={reorderHintId}
                  isCustom={customIds?.has(m.id)}
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
