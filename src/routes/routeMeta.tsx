import { matchPath } from "react-router-dom";
import type { ReactNode } from "react";
import HomeIcon from "@/icons/home.svg?react";
import CalendarIcon from "@/icons/calendar.svg?react";
import StopwatchIcon from "@/icons/stopwatch.svg?react";
import ProfilePersonIcon from "@/icons/profile-person.svg?react";
import GearIcon from "@/icons/gear.svg?react";
import InfoCircleIcon from "@/icons/info-circle.svg?react";
import PlusCircleIcon from "@/icons/plus-circle.svg?react";
import CustomMetricIcon from "@/icons/custom-metric.svg?react";
import { HEALTH_METRICS } from "../metrics/healthMetrics";
import { COMPETITION_METRICS } from "../metrics/competitionMetrics";
import { PERFORMANCE_METRICS } from "../metrics/performanceMetrics";
import {
  ADDABLE_HEALTH,
  ADDABLE_PERFORMANCE,
  ADDABLE_COMPETITION,
} from "../metrics/addableMetrics";
import type { CustomMetricDef } from "../types/customMetrics";

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
  "/health": {
    title: "Health Log",
    icon: <CalendarIcon />,
  },
  "/performance": {
    title: "Performance Log",
    icon: <StopwatchIcon />,
  },
  "/competition": {
    title: "Competition Log",
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
//
// Custom metrics are an exception: their names live in CustomMetricsContext
// rather than a static registry, so resolvers that need them accept the
// `customs` array threaded through resolveRouteMeta. AppShell reads it
// from useCustomMetrics() and passes it in unchanged.
type DynamicResolver = (
  params: Record<string, string | undefined>,
  customs: readonly CustomMetricDef[],
) => RouteMeta | null;

const PATTERNS: Array<{
  pattern: string;
  meta?: RouteMeta;
  resolve?: DynamicResolver;
}> = [
  {
    pattern: "/health/:metricId",
    resolve: (params, customs) => {
      // Tracked + addable registries both feed MetricDetail's title
      // since AddMetric's info button links into the addable space.
      const m =
        HEALTH_METRICS.find((x) => x.id === params.metricId) ??
        ADDABLE_HEALTH.find((x) => x.id === params.metricId);
      if (m) {
        return {
          title: m.name,
          icon: m.Icon ? <m.Icon /> : <CalendarIcon />,
          backTo: "/health",
        };
      }
      // Custom health metric fallthrough — match the route's :type so
      // a health URL doesn't title a competition custom metric.
      const c = customs.find(
        (x) => x.id === params.metricId && x.metricType === "health",
      );
      if (c) {
        return {
          title: c.name,
          icon: <CustomMetricIcon />,
          backTo: "/health",
        };
      }
      return null;
    },
  },
  {
    pattern: "/performance/:metricId",
    resolve: (params, customs) => {
      const m =
        PERFORMANCE_METRICS.find((x) => x.id === params.metricId) ??
        ADDABLE_PERFORMANCE.find((x) => x.id === params.metricId);
      if (m) {
        return {
          title: m.name,
          icon: m.Icon ? <m.Icon /> : <StopwatchIcon />,
          backTo: "/performance",
        };
      }
      const c = customs.find(
        (x) => x.id === params.metricId && x.metricType === "performance",
      );
      if (c) {
        return {
          title: c.name,
          icon: <CustomMetricIcon />,
          backTo: "/performance",
        };
      }
      return null;
    },
  },
  {
    pattern: "/competition/:metricId",
    resolve: (params, customs) => {
      const m =
        COMPETITION_METRICS.find((x) => x.id === params.metricId) ??
        ADDABLE_COMPETITION.find((x) => x.id === params.metricId);
      if (m) {
        return {
          title: m.name,
          icon: m.Icon ? <m.Icon /> : <StopwatchIcon />,
          backTo: "/competition",
        };
      }
      const c = customs.find(
        (x) => x.id === params.metricId && x.metricType === "competition",
      );
      if (c) {
        return {
          title: c.name,
          icon: <CustomMetricIcon />,
          backTo: "/competition",
        };
      }
      return null;
    },
  },
  {
    // /add-metric/:type/new must come BEFORE /add-metric/:type/:metricId,
    // otherwise matchPath would capture "new" as :metricId on the more
    // permissive pattern and the create form would render with no title.
    pattern: "/add-metric/:type/new",
    resolve: (params) => {
      // TODO(DGT-51 follow-up): accept "performance" here once
      // CustomMetricForm supports authoring performance customs. For
      // now AddMetric / CustomMetricForm reject "performance" and
      // redirect to /setup/tracking, so resolving a Performance title
      // here would render a stale header for one frame. Return null
      // for performance until the form supports it.
      const t = params.type;
      if (t !== "health" && t !== "competition") return null;
      return {
        title: t === "health" ? "New Health Metric" : "New Competition Metric",
        icon: <PlusCircleIcon />,
        backTo: "/setup/tracking",
      };
    },
  },
  {
    pattern: "/add-metric/:type/:metricId",
    resolve: (params, customs) => {
      // TODO(DGT-51 follow-up): mirror the change above once
      // CustomMetricForm supports performance customs.
      const t = params.type;
      if (t !== "health" && t !== "competition") return null;
      // Cross-type access (e.g. health URL on a competition metric) returns
      // null so the form's <Navigate replace /> redirect to the canonical
      // route happens without rendering a misleading title for one frame.
      const c = customs.find(
        (x) => x.id === params.metricId && x.metricType === t,
      );
      if (!c) return null;
      return {
        title: c.name,
        icon: <CustomMetricIcon />,
        backTo: "/setup/tracking",
      };
    },
  },
  {
    pattern: "/add-metric/:type",
    resolve: (params) => {
      // TODO(DGT-51 follow-up): accept "performance" once AddMetric
      // does too. Same rationale as the /add-metric/:type/new entry
      // above.
      const t = params.type;
      if (t !== "health" && t !== "competition") return null;
      return {
        title: t === "health" ? "Health Metrics" : "Competition Metrics",
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

const NO_CUSTOMS: readonly CustomMetricDef[] = [];

// Optional location-state shape consumed by resolveRouteMeta. Callers
// navigating to a metric detail (or other route with a static backTo)
// can set `backTo` here to override the registry default, so the
// SectionHeading back chevron returns the user to the page they
// actually came from. Example: SortableMetricRow on /setup/tracking
// navigates to /performance/:id with state.backTo = "/setup/tracking"
// so the back button doesn't bounce them to /performance.
export interface RouteLocationState {
  backTo?: string;
}

export function resolveRouteMeta(
  pathname: string,
  customs: readonly CustomMetricDef[] = NO_CUSTOMS,
  state?: RouteLocationState | null,
): RouteMeta | null {
  const base = resolveBase(pathname, customs);
  if (!base) return base;
  if (state && typeof state.backTo === "string") {
    return { ...base, backTo: state.backTo };
  }
  return base;
}

function resolveBase(
  pathname: string,
  customs: readonly CustomMetricDef[],
): RouteMeta | null {
  if (STATIC[pathname]) return STATIC[pathname];
  for (const entry of PATTERNS) {
    const match = matchPath({ path: entry.pattern, end: true }, pathname);
    if (!match) continue;
    if (entry.resolve) {
      return entry.resolve(
        match.params as Record<string, string | undefined>,
        customs,
      );
    }
    return entry.meta ?? null;
  }
  return null;
}
