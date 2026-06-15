import { useId, type ComponentType, type SVGProps } from "react";
import { Link, useLocation } from "react-router-dom";
import clsx from "clsx";
import { Dialog } from "../common/Dialog";
import { useAuth } from "../../contexts/AuthContext";
import { useUser } from "../../contexts/UserContext";
import HomeIcon from "@/icons/home.svg?react";
import CalendarIcon from "@/icons/calendar.svg?react";
import StopwatchIcon from "@/icons/stopwatch.svg?react";
import ProfilePersonIcon from "@/icons/profile-person.svg?react";
import GearIcon from "@/icons/gear.svg?react";
import InfoCircleIcon from "@/icons/info-circle.svg?react";
import LogoutIcon from "@/icons/logout.svg?react";
import css from "./HamburgerMenu.module.css";

interface HamburgerMenuProps {
  open: boolean;
  onClose: () => void;
}

interface MenuItem {
  label: string;
  to: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const ITEMS: MenuItem[] = [
  { label: "Dashboard", to: "/dashboard", Icon: HomeIcon },
  { label: "Health Log", to: "/health", Icon: CalendarIcon },
  { label: "Performance Log", to: "/performance", Icon: StopwatchIcon },
  { label: "Competition Log", to: "/competition", Icon: StopwatchIcon },
  { label: "Profile", to: "/profile", Icon: ProfilePersonIcon },
  { label: "Tracked Data Setup", to: "/setup/tracking", Icon: GearIcon },
  { label: "About", to: "/about", Icon: InfoCircleIcon },
];

export function HamburgerMenu({ open, onClose }: HamburgerMenuProps) {
  const { signOut } = useAuth();
  const { loadState } = useUser();
  const { pathname, search, hash } = useLocation();
  const gateHintId = useId();

  // Narrowed onboarding gate per spec:
  //   loading      -> phase='ready' (showing all items briefly is the
  //                   right failure mode; menu lives in AppShell, outside
  //                   ProtectedRoute, so this branch fires during the
  //                   brief Firestore-fetch window on cold start. A flash
  //                   of disabled items would be more disruptive than a
  //                   flash of unlocked items.)
  //   missing      -> phase='pre-profile' (new user; only /profile reachable)
  //   loaded       -> phase reflects the next incomplete onboarding step
  //                   so the user can reach the page they need to finish.
  //                   /setup/tracking unlocks once profileComplete is true,
  //                   even before trackingSetupComplete - otherwise a
  //                   partway-onboarded user can't reach the page they
  //                   need to finish onboarding.
  const phase: "ready" | "pre-profile" | "pre-tracking" =
    loadState.status === "missing"
      ? "pre-profile"
      : loadState.status === "loaded"
        ? !loadState.profile.profileComplete
          ? "pre-profile"
          : !loadState.profile.trackingSetupComplete
            ? "pre-tracking"
            : "ready"
        : "ready";
  const isOnboarding = phase !== "ready";

  function isReachable(to: string): boolean {
    if (!isOnboarding) return true;
    if (to === "/profile") return true;
    if (to === "/setup/tracking" && phase === "pre-tracking") return true;
    // About is version info + credits; it has no profile / tracking
    // prerequisite, so let users reach it from the menu even mid-onboarding.
    if (to === "/about") return true;
    return false;
  }

  const gateHint =
    phase === "pre-tracking"
      ? "Complete your tracked data setup to unlock other sections."
      : "Complete your profile to unlock other sections.";

  function handleNavigate() {
    onClose();
  }

  async function handleSignOut() {
    await signOut();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Navigation menu"
      titleVisuallyHidden
      variant="topSheet"
    >
      {isOnboarding && (
        <p id={gateHintId} className={css.gateHint}>
          {gateHint}
        </p>
      )}
      <nav aria-label="Main">
        <ul className={css.menuList}>
          {ITEMS.map(({ label, to, Icon }) => {
            const isActive = pathname === to;
            const isGated = !isReachable(to);
            return (
              <li
                key={to}
                className={clsx(css.menuItem, isGated && css.menuItemDisabled)}
              >
                {isGated ? (
                  <span
                    role="link"
                    aria-disabled="true"
                    tabIndex={0}
                    aria-describedby={gateHintId}
                    className={css.navItem}
                  >
                    <span className={css.navItemIcon}>
                      <Icon />
                    </span>
                    {label}
                  </span>
                ) : (
                  <Link
                    to={to}
                    // Seed backTo so the Profile screen's "Done" button can
                    // return the user where they came from (its only nav is a
                    // plain exit now that the form auto-saves). Include search +
                    // hash so query-derived views (e.g. /competition?date=…)
                    // are preserved. Other routes carry their own back
                    // semantics, so this is Profile-only.
                    state={
                      to === "/profile" && pathname !== "/profile"
                        ? { backTo: `${pathname}${search}${hash}` }
                        : undefined
                    }
                    className={clsx(css.navItem, isActive && css.active)}
                    aria-current={isActive ? "page" : undefined}
                    onClick={handleNavigate}
                  >
                    <span className={css.navItemIcon}>
                      <Icon />
                    </span>
                    {label}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <ul className={css.actionList}>
        <li className={css.menuItem}>
          <button
            type="button"
            className={css.navItem}
            onClick={handleSignOut}
          >
            <span className={css.navItemIcon}>
              <LogoutIcon />
            </span>
            Log Out
          </button>
        </li>
      </ul>
    </Dialog>
  );
}
