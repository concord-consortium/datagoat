// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { SectionHeading } from "./SectionHeading";
import { NavMenuProvider } from "../../contexts/NavMenuContext";
import css from "./SectionHeading.module.css";

function renderHeading(props: Partial<ComponentProps<typeof SectionHeading>>) {
  render(
    <MemoryRouter>
      <NavMenuProvider>
        <SectionHeading title="Profile" {...props} />
      </NavMenuProvider>
    </MemoryRouter>,
  );
}

describe("SectionHeading Home button gating", () => {
  it("renders the Home button as a navigable link by default", () => {
    renderHeading({});
    const home = screen.getByRole("link", { name: "Home" });
    expect(home).toHaveAttribute("href", "/dashboard");
    expect(home).not.toHaveAttribute("aria-disabled");
  });

  it("renders the Home button disabled (aria-disabled, no href, dimmed) when homeDisabled", () => {
    renderHeading({ homeDisabled: true });
    // Still exposes the link role (so SRs announce it), but as a non-navigable,
    // aria-disabled, dimmed stand-in rather than an actual anchor.
    const home = screen.getByRole("link", { name: "Home" });
    expect(home).toHaveAttribute("aria-disabled", "true");
    expect(home).not.toHaveAttribute("href");
    expect(home).toHaveClass(css.navHomeBtnDisabled);
  });

  it("suppresses the Home button entirely when a back-arrow is present", () => {
    // backTo takes the left slot; homeDisabled is moot because no Home renders.
    renderHeading({ backTo: "/health", homeDisabled: true });
    expect(screen.queryByLabelText("Home")).toBeNull();
    expect(screen.getByRole("link", { name: "Back" })).toBeInTheDocument();
  });
});
