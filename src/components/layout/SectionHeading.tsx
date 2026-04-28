import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import BackChevron from "@/icons/back-chevron.svg?react";
import HomeIcon from "@/icons/home.svg?react";
import HamburgerIcon from "@/icons/hamburger.svg?react";
import css from "./SectionHeading.module.css";

interface SectionHeadingProps {
  title: string;
  icon?: ReactNode;
  backTo?: string;
  onBack?: () => void;
  onOpenMenu: () => void;
  showHome?: boolean;
}

export function SectionHeading({
  title,
  icon,
  backTo,
  onBack,
  onOpenMenu,
  showHome = true,
}: SectionHeadingProps) {
  return (
    <h2 className={css.sectionHeading}>
      {/* data-skip-link-exclude: AppShell's skip-link focus advance
          skips these chrome buttons, landing focus on the first content
          focusable instead. */}
      {(backTo || onBack) &&
        (backTo ? (
          <Link
            to={backTo}
            className={css.backNavBtn}
            aria-label={`Back`}
            data-skip-link-exclude
          >
            <BackChevron />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onBack}
            className={css.backNavBtn}
            aria-label="Back"
            data-skip-link-exclude
          >
            <BackChevron />
          </button>
        ))}
      {icon && <span className={css.iconSlot}>{icon}</span>}
      <span className={css.titleText}>{title}</span>
      {showHome && (
        <Link
          to="/dashboard"
          className={css.navHomeBtn}
          aria-label="Dashboard"
          data-skip-link-exclude
        >
          <HomeIcon />
        </Link>
      )}
      <button
        type="button"
        className={css.navMenuBtn}
        aria-label="Menu"
        aria-haspopup="true"
        onClick={onOpenMenu}
        data-skip-link-exclude
      >
        <HamburgerIcon />
      </button>
    </h2>
  );
}
