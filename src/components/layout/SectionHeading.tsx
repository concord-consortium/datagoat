import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { useNavMenu } from "../../contexts/NavMenuContext";
import BackChevron from "@/icons/back-chevron.svg?react";
import HomeIcon from "@/icons/home.svg?react";
import HamburgerIcon from "@/icons/hamburger.svg?react";
import css from "./SectionHeading.module.css";

interface SectionHeadingProps {
  title: string;
  icon?: ReactNode;
  backTo?: string;
  onBack?: () => void;
  showHome?: boolean;
  // During onboarding the Dashboard is unreachable (ProtectedRoute bounces the
  // user back), so the Home button must look and behave as disabled rather than
  // appearing clickable but doing nothing. Mirrors the hamburger's gated
  // Dashboard item.
  homeDisabled?: boolean;
}

// SectionHeading consumes NavMenuContext directly so the home + back
// buttons can close the menu on click (matches prototype: any
// navigation chrome action closes the open menu) and the hamburger
// button shares the same source of truth as the Dialog's open state.
export function SectionHeading({
  title,
  icon,
  backTo,
  onBack,
  showHome = true,
  homeDisabled = false,
}: SectionHeadingProps) {
  const { isOpen: menuOpen, setIsOpen: setMenuOpen } = useNavMenu();
  const closeMenu = () => {
    if (menuOpen) setMenuOpen(false);
  };
  return (
    // Outer wrapper is a <div>, not <h2>, so the back/home/hamburger
    // buttons are siblings of the heading rather than children of it.
    // Nesting interactive controls inside <h2> made the heading's
    // accessible name concatenate "Back ... Dashboard ... Menu" with
    // the title, polluting the document outline.
    <div className={css.sectionHeading}>
      {/* data-skip-link-exclude: AppShell's skip-link focus advance
          skips these chrome buttons, landing focus on the first content
          focusable instead. */}
      {/* Back button takes the left slot; when present, the home button
          is suppressed below to avoid overlap (per Session 4.5 hand-off:
          back-nav-btn and nav-home-btn both sit at left:12px in the
          prototype, and the prototype never combines them). */}
      {(backTo || onBack) &&
        (backTo ? (
          <Link
            to={backTo}
            className={css.backNavBtn}
            aria-label="Back"
            onClick={closeMenu}
            data-skip-link-exclude
          >
            <BackChevron />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              closeMenu();
              onBack?.();
            }}
            className={css.backNavBtn}
            aria-label="Back"
            data-skip-link-exclude
          >
            <BackChevron />
          </button>
        ))}
      <h1 className={css.title}>
        {icon && <span className={css.iconSlot}>{icon}</span>}
        <span className={css.titleText}>{title}</span>
      </h1>
      {showHome &&
        !(backTo || onBack) &&
        (homeDisabled ? (
          // Non-interactive, dimmed stand-in for the Home link. aria-disabled
          // (not the disabled attr, which only applies to form controls)
          // conveys the state; pointer-events:none + no tabIndex keep it
          // unclickable and out of the tab order.
          <span
            role="link"
            aria-disabled="true"
            aria-label="Home"
            className={clsx(css.navHomeBtn, css.navHomeBtnDisabled)}
            data-skip-link-exclude
          >
            <HomeIcon />
          </span>
        ) : (
          <Link
            to="/dashboard"
            className={css.navHomeBtn}
            aria-label="Home"
            onClick={closeMenu}
            data-skip-link-exclude
          >
            <HomeIcon />
          </Link>
        ))}
      <button
        type="button"
        className={css.navMenuBtn}
        aria-label="Menu"
        aria-haspopup="true"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(!menuOpen)}
        data-skip-link-exclude
      >
        <HamburgerIcon />
      </button>
    </div>
  );
}
