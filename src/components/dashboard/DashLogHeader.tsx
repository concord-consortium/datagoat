import { Link } from "react-router-dom";
import css from "./DashLogHeader.module.css";

import CalendarIcon from "@/icons/calendar.svg?react";
import StopwatchIcon from "@/icons/stopwatch.svg?react";

interface DashLogHeaderProps {
  type: "wellness" | "performance";
  // Free text status: e.g. "Log your 5 metrics for today." for wellness
  // or "No perf. data logged today." for performance.
  status: string;
  // Optional highlight phrase rendered with the .statusHighlight bold
  // accent color. Inserted via {pre}{highlight}{post} so the parent can
  // pick exactly which span gets bolded.
  pre?: string;
  highlight?: string;
  post?: string;
}

export function DashLogHeader({
  type,
  status,
  pre,
  highlight,
  post,
}: DashLogHeaderProps) {
  const Icon = type === "wellness" ? CalendarIcon : StopwatchIcon;
  const to = type === "wellness" ? "/wellness" : "/performance";
  const label =
    type === "wellness"
      ? "Go to Health & Wellness Log"
      : "Go to Performance Log";

  return (
    <Link
      to={to}
      className={css.dashLogHeader}
      aria-label={label}
      data-skip-link-exclude
    >
      <div className={css.dashLogNavBtn} aria-hidden="true">
        <Icon />
      </div>
      <p className={css.dashLogStatus}>
        {highlight ? (
          <>
            {pre}
            <span className={css.statusHighlight}>{highlight}</span>
            {post}
          </>
        ) : (
          status
        )}
      </p>
    </Link>
  );
}
