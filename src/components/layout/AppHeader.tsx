import HamburgerIcon from "@/icons/hamburger.svg?react";
import css from "./AppHeader.module.css";

interface AppHeaderProps {
  onOpenMenu: () => void;
}

export function AppHeader({ onOpenMenu }: AppHeaderProps) {
  return (
    <div className={css.appHeader}>
      <h1 className={css.appWordmark}>DataGOAT</h1>
      <span className={css.appTagline}>Personal Data for Athletes</span>
      <button
        type="button"
        className={css.menuBtn}
        aria-label="Menu"
        aria-haspopup="true"
        onClick={onOpenMenu}
      >
        <HamburgerIcon />
      </button>
    </div>
  );
}
