import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import css from "./Dialog.module.css";
import common from "../common.module.css";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  titleVisuallyHidden?: boolean;
  variant?: "centered" | "topSheet";
  children: ReactNode;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export function Dialog({
  open,
  onClose,
  title,
  titleVisuallyHidden,
  variant = "centered",
  children,
}: DialogProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const surface = surfaceRef.current;
    if (!surface) return;

    const focusables = getFocusable(surface);
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      surface.focus();
    }

    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleSurfaceKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const focusables = getFocusable(surface);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const layoutClass = variant === "topSheet" ? css.topSheet : css.centered;
  const surfaceClass =
    variant === "topSheet" ? css.dialogSurfaceTopSheet : css.dialogSurfaceCentered;

  return (
    <div
      className={`${css.dialogBackdrop} ${layoutClass}`}
      onClick={handleBackdropClick}
    >
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={surfaceClass}
        onKeyDown={handleSurfaceKey}
      >
        <h2
          id={titleId}
          className={
            titleVisuallyHidden ? common.visuallyHidden : css.dialogTitle
          }
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
