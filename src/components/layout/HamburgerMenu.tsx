import type { ComponentType, SVGProps } from "react";
import { Link, useLocation } from "react-router-dom";
import { Dialog } from "../common/Dialog";
import { useAuth } from "../../contexts/AuthContext";
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
  // Onboarding gate placeholder. Wired up in this step but always passes (no
  // profile state yet); the gate becomes meaningful once UserContext lands.
  isOnboarding?: boolean;
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

export function HamburgerMenu({
  open,
  onClose,
  isOnboarding = false,
}: HamburgerMenuProps) {
  const { signOut } = useAuth();
  const { pathname } = useLocation();

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
      <ul className={css.menuList}>
        {ITEMS.map(({ label, to, Icon }) => {
          const isActive = pathname === to;
          return (
            <li
              key={to}
              className={`${css.menuItem} ${isOnboarding ? css.menuItemDisabled : ""}`}
            >
              <Link
                to={to}
                className={`${css.navItem} ${isActive ? css.active : ""}`}
                aria-current={isActive ? "page" : undefined}
                aria-disabled={isOnboarding || undefined}
                onClick={handleNavigate}
              >
                <span className={css.navItemIcon}>
                  <Icon />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
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
