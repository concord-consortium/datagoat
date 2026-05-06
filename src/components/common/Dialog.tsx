import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useOverlayRegister } from "../../contexts/OverlayContext";
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

function hideSiblingsFromAT(
  node: HTMLElement,
): Array<[HTMLElement, string | null]> {
  const restored: Array<[HTMLElement, string | null]> = [];
  let cur: HTMLElement = node;
  while (cur.parentElement && cur !== document.body) {
    const parent = cur.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === cur || !(sibling instanceof HTMLElement)) continue;
      restored.push([sibling, sibling.getAttribute("aria-hidden")]);
      sibling.setAttribute("aria-hidden", "true");
    }
    cur = parent;
  }
  return restored;
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
  const registerOverlay = useOverlayRegister();

  // Reference-count this dialog with OverlayContext so consumers
  // (carousel pause, focusin auto-scroll guard) can read a single
  // "is any overlay open" signal rather than subscribing to each
  // overlay's state individually.
  useEffect(() => {
    if (!open) return;
    return registerOverlay();
  }, [open, registerOverlay]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const surface = surfaceRef.current;
    if (!surface) return;

    const priorAriaHidden = hideSiblingsFromAT(surface);

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

    function onFocusIn(e: FocusEvent) {
      if (!surface || surface.contains(e.target as Node | null)) return;
      const items = getFocusable(surface);
      if (items.length > 0) {
        items[0].focus();
      } else {
        surface.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn, true);

    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("keydown", onKey);
      for (const [el, prior] of priorAriaHidden) {
        if (prior === null) {
          el.removeAttribute("aria-hidden");
        } else {
          el.setAttribute("aria-hidden", prior);
        }
      }
      // isConnected guards against a detached opener: if the surrounding
      // tree unmounted the trigger while the dialog was open, .focus() on
      // a detached node silently dumps focus to <body>. Fall back to the
      // <main> landmark so SR/keyboard users land somewhere meaningful.
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      } else {
        document.getElementById("main-content")?.focus();
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
