// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "./Dialog";

function Harness({
  open,
  onClose,
  children,
  variant,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  variant?: "centered" | "topSheet";
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Test" variant={variant}>
      {children}
    </Dialog>
  );
}

describe("Dialog", () => {
  it("focuses the first focusable child on open", () => {
    const onClose = vi.fn();
    render(
      <Harness open onClose={onClose}>
        <button>First</button>
        <button>Second</button>
      </Harness>,
    );
    expect(document.activeElement?.textContent).toBe("First");
  });

  it("focuses the surface when no focusable child exists", () => {
    const onClose = vi.fn();
    render(
      <Harness open onClose={onClose}>
        <span>just text</span>
      </Harness>,
    );
    expect(document.activeElement?.getAttribute("role")).toBe("dialog");
  });

  it("Tab cycles forward within the dialog", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Harness open onClose={onClose}>
        <button>First</button>
        <button>Second</button>
      </Harness>,
    );
    expect(document.activeElement?.textContent).toBe("First");
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Second");
    await user.tab();
    // wraps from last back to first
    expect(document.activeElement?.textContent).toBe("First");
  });

  it("Shift-Tab cycles backward", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Harness open onClose={onClose}>
        <button>First</button>
        <button>Second</button>
      </Harness>,
    );
    // Move focus to second so Shift-Tab back goes to first
    (
      screen.getByRole("button", { name: "Second" }) as HTMLButtonElement
    ).focus();
    await user.tab({ shift: true });
    expect(document.activeElement?.textContent).toBe("First");
    // wraps from first backward to last
    await user.tab({ shift: true });
    expect(document.activeElement?.textContent).toBe("Second");
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(
      <Harness open onClose={onClose}>
        <button>x</button>
      </Harness>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("backdrop click calls onClose", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Harness open onClose={onClose}>
        <button>x</button>
      </Harness>,
    );
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("returns focus to the trigger on close", () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "trigger";
    document.body.appendChild(trigger);
    trigger.focus();
    const { rerender } = render(
      <Harness open onClose={onClose}>
        <button>x</button>
      </Harness>,
    );
    expect(document.activeElement?.textContent).toBe("x");
    act(() => {
      rerender(
        <Harness open={false} onClose={onClose}>
          <button>x</button>
        </Harness>,
      );
    });
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it("falls back to #main-content when the opener was unmounted while open", () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "trigger";
    document.body.appendChild(trigger);
    const main = document.createElement("main");
    main.id = "main-content";
    main.tabIndex = 0;
    document.body.appendChild(main);
    trigger.focus();
    const { rerender } = render(
      <Harness open onClose={onClose}>
        <button>x</button>
      </Harness>,
    );
    // Simulate the surrounding tree removing the opener while the dialog
    // is open (e.g. the open button was conditionally rendered).
    document.body.removeChild(trigger);
    act(() => {
      rerender(
        <Harness open={false} onClose={onClose}>
          <button>x</button>
        </Harness>,
      );
    });
    expect(document.activeElement).toBe(main);
    document.body.removeChild(main);
  });

  it("has role=dialog, aria-modal=true, and aria-labelledby pointing at title", () => {
    const onClose = vi.fn();
    render(
      <Harness open onClose={onClose}>
        <button>x</button>
      </Harness>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    const titleEl = document.getElementById(labelId!);
    expect(titleEl?.textContent).toBe("Test");
  });
});
