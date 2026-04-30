import type { CSSProperties, ComponentType, SVGProps } from "react";
import { Link } from "react-router-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import DragDots from "@/icons/drag-dots.svg?react";
import InfoCircleIcon from "@/icons/info-circle.svg?react";
import css from "./TrackedMetricsTable.module.css";

interface SortableMetricRowProps {
  id: string;
  name: string;
  type: "wellness" | "performance";
  checked: boolean;
  Icon?: ComponentType<SVGProps<SVGSVGElement>>;
  onToggleCheck: () => void;
  // Id of the visible reorder-instructions paragraph rendered once per
  // table; the drag handle aria-describedby's it so SR users hear the
  // keyboard shortcut summary on focus.
  reorderHintId: string;
}

export function SortableMetricRow({
  id,
  name,
  type,
  checked,
  Icon,
  onToggleCheck,
  reorderHintId,
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

  const MetricIcon = Icon ?? InfoCircleIcon;

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
          aria-describedby={Array.from(
            new Set(
              [
                ...(attributes["aria-describedby"]?.split(/\s+/) ?? []),
                reorderHintId,
              ].filter(Boolean)
            )
          ).join(" ")}
        >
          <DragDots />
        </button>
      </td>
      <td>
        <input
          type="checkbox"
          className={css.trackCheck}
          checked={checked}
          onChange={onToggleCheck}
          aria-label={`Track ${name}`}
        />
      </td>
      <td className={css.metricName}>{name}</td>
      <td>
        <Link
          to={`/${type}/${id}`}
          className={css.metricInfoBtn}
          aria-label={`${name} info`}
        >
          <MetricIcon />
        </Link>
      </td>
    </tr>
  );
}
