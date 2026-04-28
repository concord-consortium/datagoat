import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import DragDots from "@/icons/drag-dots.svg?react";
import TrashIcon from "@/icons/trash.svg?react";
import InfoCircleIcon from "@/icons/info-circle.svg?react";
import css from "./TrackedMetricsTable.module.css";

interface SortableMetricRowProps {
  id: string;
  name: string;
  type: "wellness" | "performance";
  editing: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  onDelete: () => void;
}

export function SortableMetricRow({
  id,
  name,
  type,
  editing,
  checked,
  onToggleCheck,
  onDelete,
}: SortableMetricRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={isDragging ? css.dragging : undefined}
    >
      <td className={css.colDrag}>
        <button
          type="button"
          className={css.dragHandle}
          aria-label={`Reorder ${name}`}
          {...attributes}
          {...listeners}
        >
          <DragDots />
        </button>
      </td>
      <td>
        {/* Track checkbox stays visible in edit mode per prototype - the
            edit-mode chrome is the delete column sliding in via the
            .colDel width/opacity transition, not the checkbox going
            away. The implementor's earlier short-circuit was wrong. */}
        <input
          type="checkbox"
          className={css.trackCheck}
          checked={checked}
          onChange={onToggleCheck}
          aria-label={`Track ${name}`}
          disabled={editing}
        />
      </td>
      <td className={css.metricName}>{name}</td>
      <td>
        <Link
          to={`/${type}/${id}`}
          className={css.metricInfoBtn}
          aria-label={`${name} info`}
        >
          <InfoCircleIcon />
        </Link>
      </td>
      <td className={css.colDel}>
        {editing && (
          <button
            type="button"
            className={css.deleteRowBtn}
            aria-label={`Remove ${name}`}
            onClick={onDelete}
          >
            <TrashIcon />
          </button>
        )}
      </td>
    </tr>
  );
}
