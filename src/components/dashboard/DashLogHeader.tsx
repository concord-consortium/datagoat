import { Link } from "react-router-dom";
import css from "./DashLogHeader.module.css";

import CalendarIcon from "@/icons/calendar.svg?react";
import StopwatchIcon from "@/icons/stopwatch.svg?react";

// Non-breaking space (U+00A0) - keeps the highlight pill from wrapping
// onto its own line at narrow widths, matching the prototype's HTML at
// line 4196 where &nbsp; brackets the .status-highlight span.
const NBSP = "\u00A0";

interface DashLogHeaderProps {
  type: "health" | "performance" | "competition";
  // Free text status: e.g. "Log your 5 metrics for today." for health
  // or "No competition data logged today." for competition.
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
  // Health = Calendar (daily logging); Performance + Competition =
  // Stopwatch (periodic / event-anchored data). Matches the icon
  // choice in routeMeta and HamburgerMenu so the Performance section
  // has a single visual identity across surfaces.
  const Icon = type === "health" ? CalendarIcon : StopwatchIcon;
  const to = "/log";
  // Lead the accessible name with the visible status so WCAG 2.5.3
  // (Label in Name) is satisfied — voice control "click log your 5
  // remaining metrics" must match the visible text.
  const label =
    type === "health"
      ? `${status} Go to Health Log.`
      : type === "performance"
        ? `${status} Go to Performance Log.`
        : `${status} Go to Competition Log.`;

  const preHasTrailingSpace = !!pre && /\s$/.test(pre);
  const postHasLeadingSpace = !!post && /^\s/.test(post);
  const trimmedPre = pre?.replace(/\s+$/, "") ?? "";
  const trimmedPost = post?.replace(/^\s+/, "") ?? "";

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
            {trimmedPre}
            {preHasTrailingSpace && NBSP}
            <span className={css.statusHighlight}>{highlight}</span>
            {postHasLeadingSpace && NBSP}
            {trimmedPost}
          </>
        ) : (
          status
        )}
      </p>
    </Link>
  );
}
