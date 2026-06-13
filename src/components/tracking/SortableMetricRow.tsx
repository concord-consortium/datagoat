import type { CSSProperties, ComponentType, SVGProps } from "react";
import { Link } from "react-router-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import DragDots from "@/icons/drag-dots.svg?react";
import InfoCircleIcon from "@/icons/info-circle.svg?react";
import CustomMetricIcon from "@/icons/custom-metric.svg?react";
import { If } from "../common/If";
import css from "./TrackedMetricsTable.module.css";

interface SortableMetricRowProps {
  id: string;
  name: string;
  type: "health" | "performance" | "competition";
  checked: boolean;
  Icon?: ComponentType<SVGProps<SVGSVGElement>>;
  onToggleCheck: () => void;
  // Id of the visible reorder-instructions paragraph rendered once per
  // table; the drag handle aria-describedby's it so SR users hear the
  // keyboard shortcut summary on focus.
  reorderHintId: string;
  // True for user-defined custom metrics. Affects only the Info-cell
  // icon (CustomMetricIcon instead of the built-in's Icon). The
  // edit-pencil cell renders only for checked (tracked) rows.
  isCustom?: boolean;
}

export function SortableMetricRow({
  id,
  name,
  type,
  checked,
  Icon,
  onToggleCheck,
  reorderHintId,
  isCustom = false,
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
      <td className={css.metricName} title={name}>
        {/* Definition link: same destination (MetricDetail) as the info
            icon, so the label and icon both open the metric's
            definition. backTo returns the user to /setup/tracking. */}
        <Link
          to={`/${type}/${id}`}
          state={{ backTo: "/setup/tracking" }}
          className={css.definitionLink}
        >
          {name}
        </Link>
      </td>
      <td>
        {/* Edit-pencil cell: links to the metric's edit form (custom
            metrics open CustomMetricForm, built-ins open
            MetricOverrideForm). Shown only for tracked (checked)
            metrics - editing a goal/axis is meaningless for a metric
            the user isn't tracking. */}
        <If condition={checked}>
          <Link
            to={`/add-metric/${type}/${id}`}
            className={css.metricInfoBtn}
            aria-label={`Edit ${name}`}
          >
            ✏︎
          </Link>
        </If>
      </td>
      <td>
        {/* Info link: same destination (MetricDetail) for both
            built-ins and customs. Customs use the custom-metric icon
            here so the row carries a visible "this is a custom" cue
            in addition to functioning as the chart-detail link. */}
        <Link
          to={`/${type}/${id}`}
          // Pass backTo via location state so MetricDetail's back chevron
          // returns the user to /setup/tracking instead of bouncing them
          // to the log page (the registry default for that detail route).
          state={{ backTo: "/setup/tracking" }}
          className={css.metricInfoBtn}
          aria-label={`${name} info`}
        >
          {isCustom ? <CustomMetricIcon /> : <MetricIcon />}
        </Link>
      </td>
    </tr>
  );
}
