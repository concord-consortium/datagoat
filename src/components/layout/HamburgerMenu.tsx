import { Link } from "react-router-dom";
import { Dialog } from "../common/Dialog";
import { useAuth } from "../../contexts/AuthContext";
import css from "./HamburgerMenu.module.css";

interface HamburgerMenuProps {
  open: boolean;
  onClose: () => void;
  // Onboarding gate placeholder. Wired up in this step but always passes (no
  // profile state yet); the gate becomes meaningful once UserContext lands.
  isOnboarding?: boolean;
}

const ITEMS: Array<{ label: string; to: string }> = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Health & Wellness Log", to: "/wellness" },
  { label: "Performance Log", to: "/performance" },
  { label: "Profile", to: "/profile" },
  { label: "Tracked Data Setup", to: "/setup/tracking" },
  { label: "About", to: "/about" },
];

export function HamburgerMenu({
  open,
  onClose,
  isOnboarding = false,
}: HamburgerMenuProps) {
  const { signOut } = useAuth();

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
      variant="drawer"
    >
      <ul className={css.menuList}>
        {ITEMS.map((item) => (
          <li
            key={item.to}
            className={`${css.menuItem} ${isOnboarding ? css.menuItemDisabled : ""}`}
          >
            <Link
              to={item.to}
              className={css.menuLink}
              aria-disabled={isOnboarding || undefined}
              onClick={handleNavigate}
            >
              {item.label}
            </Link>
          </li>
        ))}
        <li className={`${css.menuItem} ${css.signOutItem}`}>
          <button
            type="button"
            className={css.menuButton}
            onClick={handleSignOut}
          >
            Log Out
          </button>
        </li>
      </ul>
    </Dialog>
  );
}
