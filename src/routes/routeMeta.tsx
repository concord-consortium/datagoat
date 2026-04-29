import { matchPath } from "react-router-dom";
import type { ReactNode } from "react";
import HomeIcon from "@/icons/home.svg?react";
import CalendarIcon from "@/icons/calendar.svg?react";
import StopwatchIcon from "@/icons/stopwatch.svg?react";
import ProfilePersonIcon from "@/icons/profile-person.svg?react";
import GearIcon from "@/icons/gear.svg?react";
import InfoCircleIcon from "@/icons/info-circle.svg?react";
import PlusCircleIcon from "@/icons/plus-circle.svg?react";

export interface RouteMeta {
  title: string;
  icon: ReactNode;
  // Dashboard suppresses the Home button (it IS the home).
  showHome?: boolean;
}

// Static path -> meta. Dynamic paths (metric detail, info, add-metric)
// match by pattern below. Section-heading is rendered by AppShell using
// the resolved meta so it sits inside <header> outside the scroll
// container (matches the prototype's "section-heading is sticky above
// the screen-body" pattern - in the React app, "above main" rather
// than "sticky inside main").
const STATIC: Record<string, RouteMeta> = {
  "/dashboard": {
    title: "Dashboard",
    icon: <HomeIcon />,
    showHome: false,
  },
  "/wellness": {
    title: "Health & Wellness Log",
    icon: <CalendarIcon />,
  },
  "/performance": {
    title: "Performance Log",
    icon: <StopwatchIcon />,
  },
  "/profile": {
    title: "Profile",
    icon: <ProfilePersonIcon />,
  },
  "/setup/tracking": {
    title: "Tracked Data Setup",
    icon: <GearIcon />,
  },
  "/about": {
    title: "About",
    icon: <InfoCircleIcon />,
  },
};

const PATTERNS: Array<{ pattern: string; meta: RouteMeta }> = [
  {
    pattern: "/wellness/:metricId",
    meta: { title: "Metric Detail", icon: <CalendarIcon /> },
  },
  {
    pattern: "/performance/:metricId",
    meta: { title: "Metric Detail", icon: <StopwatchIcon /> },
  },
  {
    pattern: "/add-metric/:type",
    meta: { title: "Add Metric", icon: <PlusCircleIcon /> },
  },
  {
    pattern: "/info/:topic",
    meta: { title: "Information", icon: <InfoCircleIcon /> },
  },
];

export function resolveRouteMeta(pathname: string): RouteMeta | null {
  if (STATIC[pathname]) return STATIC[pathname];
  for (const { pattern, meta } of PATTERNS) {
    if (matchPath({ path: pattern, end: true }, pathname)) return meta;
  }
  return null;
}
