// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
