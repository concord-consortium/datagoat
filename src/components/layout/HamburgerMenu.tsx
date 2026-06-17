import { useId, type ComponentType, type SVGProps } from "react";
import { Link, useLocation } from "react-router-dom";
import clsx from "clsx";
import { Dialog } from "../common/Dialog";
import { useAuth } from "../../contexts/AuthContext";
import { useOnboardingGate } from "../../hooks/useOnboardingGate";
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
  const { phase, isOnboarding, isReachable } = useOnboardingGate();
  const { pathname } = useLocation();
  const gateHintId = useId();

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
            Sign Out
          </button>
        </li>
      </ul>
    </Dialog>
  );
}
