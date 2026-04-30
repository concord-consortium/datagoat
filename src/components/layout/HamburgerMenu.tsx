import type { ComponentType, SVGProps } from "react";
import { Link, useLocation } from "react-router-dom";
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
  { label: "Health & Wellness Log", to: "/wellness", Icon: CalendarIcon },
  { label: "Performance Log", to: "/performance", Icon: StopwatchIcon },
  { label: "Profile", to: "/profile", Icon: ProfilePersonIcon },
  { label: "Tracked Data Setup", to: "/setup/tracking", Icon: GearIcon },
  { label: "About", to: "/about", Icon: InfoCircleIcon },
];

export function HamburgerMenu({ open, onClose }: HamburgerMenuProps) {
  const { signOut } = useAuth();
  const { loadState } = useUser();
  const { pathname } = useLocation();

  // Narrowed onboarding gate per spec:
  //   loading -> false (showing all items briefly is the right failure
  //              mode; menu lives in AppShell, outside ProtectedRoute, so
  //              this branch fires during the brief Firestore-fetch window
  //              on cold start. A flash of disabled items would be more
  //              disruptive than a flash of unlocked items.)
  //   missing -> true  (new user; lock everything except Profile)
  //   loaded  -> gate on profileComplete && trackingSetupComplete
  const isOnboarding =
    loadState.status === "missing"
      ? true
      : loadState.status === "loaded"
        ? !loadState.profile.profileComplete ||
          !loadState.profile.trackingSetupComplete
        : false;

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
        <p id="hamburgerGateHint" className={css.gateHint}>
          Complete your profile to unlock other sections.
        </p>
      )}
      <nav aria-label="Main">
        <ul className={css.menuList}>
          {ITEMS.map(({ label, to, Icon }) => {
            const isActive = pathname === to;
            // Profile is always reachable so a partway-onboarded user can
            // finish their profile. Every other route is gated.
            const isGated = isOnboarding && to !== "/profile";
            return (
              <li
                key={to}
                className={`${css.menuItem} ${isGated ? css.menuItemDisabled : ""}`}
              >
                <Link
                  to={to}
                  className={`${css.navItem} ${isActive ? css.active : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  aria-disabled={isGated || undefined}
                  aria-describedby={isGated ? "hamburgerGateHint" : undefined}
                  onClick={(e) => {
                    if (isGated) {
                      e.preventDefault();
                      return;
                    }
                    handleNavigate();
                  }}
                >
                  <span className={css.navItemIcon}>
                    <Icon />
                  </span>
                  {label}
                </Link>
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
