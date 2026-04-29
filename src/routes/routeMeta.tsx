import { matchPath } from "react-router-dom";
import type { ReactNode } from "react";
import HomeIcon from "@/icons/home.svg?react";
import CalendarIcon from "@/icons/calendar.svg?react";
import StopwatchIcon from "@/icons/stopwatch.svg?react";
import ProfilePersonIcon from "@/icons/profile-person.svg?react";
import GearIcon from "@/icons/gear.svg?react";
import InfoCircleIcon from "@/icons/info-circle.svg?react";
import PlusCircleIcon from "@/icons/plus-circle.svg?react";
import { WELLNESS_METRICS } from "../metrics/wellnessMetrics";
import { PERFORMANCE_METRICS } from "../metrics/performanceMetrics";
import {
  ADDABLE_WELLNESS,
  ADDABLE_PERFORMANCE,
} from "../metrics/addableMetrics";

export interface RouteMeta {
  title: string;
  icon: ReactNode;
  // Dashboard suppresses the Home button (it IS the home).
  showHome?: boolean;
  // When set, SectionHeading renders a back chevron linking here.
  // Prototype's #metric-detail-screen + info screens both have a back
  // button in their section-heading (HTML around line 4394, 4410).
  backTo?: string;
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

// Per-pattern dynamic resolver. Returning null falls through (AppShell
// renders no SectionHeading - the route component is responsible for
// recovering, e.g. MetricDetail issues <Navigate replace /> for unknown
// metric IDs and the next route's meta takes over after the redirect).
//
// The routeMeta seam is "AppShell decides what header to show purely from
// the URL, no useEffect coordination required" - keep dynamic resolution
// synchronous + URL-only. If a route ever needs meta sourced from
// component state, switch to a useRouteMetaOverride context at that point.
type DynamicResolver = (
  params: Record<string, string | undefined>,
) => RouteMeta | null;

const PATTERNS: Array<{
  pattern: string;
  meta?: RouteMeta;
  resolve?: DynamicResolver;
}> = [
  {
    pattern: "/wellness/:metricId",
    resolve: (params) => {
      // Tracked + addable registries both feed MetricDetail's title
      // since AddMetric's info button links into the addable space.
      const m =
        WELLNESS_METRICS.find((x) => x.id === params.metricId) ??
        ADDABLE_WELLNESS.find((x) => x.id === params.metricId);
      if (!m) return null;
      return {
        title: m.name,
        icon: m.Icon ? <m.Icon /> : <CalendarIcon />,
        backTo: "/wellness",
      };
    },
  },
  {
    pattern: "/performance/:metricId",
    resolve: (params) => {
      const m =
        PERFORMANCE_METRICS.find((x) => x.id === params.metricId) ??
        ADDABLE_PERFORMANCE.find((x) => x.id === params.metricId);
      if (!m) return null;
      return {
        title: m.name,
        icon: m.Icon ? <m.Icon /> : <StopwatchIcon />,
        backTo: "/performance",
      };
    },
  },
  {
    pattern: "/add-metric/:type",
    resolve: (params) => {
      // Match the prototype's #add-metric-title text (HTML around line
      // 8596: "Add Health & Wellness Metric" / "Add Performance Metric").
      const t = params.type;
      if (t !== "wellness" && t !== "performance") return null;
      return {
        title:
          t === "wellness"
            ? "Add Health & Wellness Metric"
            : "Add Performance Metric",
        icon: <PlusCircleIcon />,
        backTo: "/setup/tracking",
      };
    },
  },
  {
    pattern: "/info/:topic",
    resolve: (params) => {
      // Match the prototype's per-screen heading text (HTML lines 4410,
      // 4434, 4450). Unknown topic returns null - InfoScreen issues
      // <Navigate replace /> to /profile (the entry point).
      switch (params.topic) {
        case "athlete-type":
          return {
            title: "Athlete Type",
            icon: <InfoCircleIcon />,
            backTo: "/profile",
          };
        case "gender":
          return {
            title: "Gender",
            icon: <InfoCircleIcon />,
            backTo: "/profile",
          };
        case "comp-term":
          return {
            title: "Competition Term",
            icon: <InfoCircleIcon />,
            backTo: "/profile",
          };
        default:
          return null;
      }
    },
  },
];

export function resolveRouteMeta(pathname: string): RouteMeta | null {
  if (STATIC[pathname]) return STATIC[pathname];
  for (const entry of PATTERNS) {
    const match = matchPath({ path: entry.pattern, end: true }, pathname);
    if (!match) continue;
    if (entry.resolve) {
      return entry.resolve(match.params as Record<string, string | undefined>);
    }
    return entry.meta ?? null;
  }
  return null;
}
