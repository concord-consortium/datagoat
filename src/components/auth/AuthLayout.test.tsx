// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthLayout } from "./AuthLayout";

describe("AuthLayout landmarks", () => {
  it("renders the brand chrome inside a <header> landmark (banner role)", () => {
    render(
      <AuthLayout heading="Sign In">
        <p>form</p>
      </AuthLayout>,
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("renders the form area inside a <main> landmark with id=main-content", () => {
    render(
      <AuthLayout heading="Sign In">
        <p>form</p>
      </AuthLayout>,
    );
    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveAttribute("tabIndex", "-1");
  });

  it("skip link advances focus to the first content control, not <main> itself", async () => {
    // Regression for DGT-47: a bare <a href="#main-content"> anchor jump
    // lands focus on the tabIndex={-1} <main>, ringing the whole page. The
    // skip link must instead advance to the first real control inside <main>.
    const user = userEvent.setup();
    render(
      <AuthLayout heading="Sign In">
        <input type="email" aria-label="Email" />
        <button type="submit">Sign in</button>
      </AuthLayout>,
    );
    const main = screen.getByRole("main");
    await user.click(
      screen.getByRole("link", { name: /skip to main content/i }),
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
    expect(document.activeElement).not.toBe(main);
  });
});
