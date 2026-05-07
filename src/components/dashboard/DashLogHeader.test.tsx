// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { DashLogHeader } from "./DashLogHeader";

const NBSP = " ";

function renderHeader(props: Parameters<typeof DashLogHeader>[0]) {
  return render(
    <MemoryRouter>
      <DashLogHeader {...props} />
    </MemoryRouter>,
  );
}

describe("DashLogHeader", () => {
  it("renders an anchor with href /wellness for type=wellness, /performance for type=performance", () => {
    const wellness = renderHeader({
      type: "wellness",
      status: "Log your 5 metrics for today.",
    });
    const wLink = wellness.container.querySelector("a")!;
    expect(wLink.getAttribute("href")).toBe("/wellness");

    const perf = renderHeader({
      type: "performance",
      status: "No perf. data logged today.",
    });
    const pLink = perf.container.querySelector("a")!;
    expect(pLink.getAttribute("href")).toBe("/performance");
  });

  it("aria-label leads with the visible status (WCAG 2.5.3 Label in Name)", () => {
    const { container } = renderHeader({
      type: "wellness",
      status: "Log your 5 metrics for today.",
    });
    const link = container.querySelector("a")!;
    expect(link.getAttribute("aria-label")).toBe(
      "Log your 5 metrics for today. Go to Health & Wellness Log.",
    );
    // Visible <p> shows just the status, no SR suffix bleed-through.
    const p = container.querySelector("p")!;
    expect(p.textContent).toBe("Log your 5 metrics for today.");
  });

  it("renders pre/highlight/post in document order with the highlight wrapped in .statusHighlight", () => {
    const { container } = renderHeader({
      type: "wellness",
      status: "Log your 3 remaining metrics.",
      pre: "Log your ",
      highlight: "3 remaining metrics",
      post: ".",
    });
    const p = container.querySelector("p")!;
    const highlight = p.querySelector("[class*='statusHighlight']")!;
    expect(highlight.textContent).toBe("3 remaining metrics");
    // Composed visible text equals pre + highlight + post (NBSP is U+00A0
    // so the combined string still matches when comparing against a
    // literal space in the assertion below).
    expect(p.textContent?.replace(/ /g, " ")).toBe(
      "Log your 3 remaining metrics.",
    );
  });

  it("inserts NBSP between pre and highlight when pre has trailing whitespace", () => {
    const { container } = renderHeader({
      type: "wellness",
      status: "x",
      pre: "Log your ",
      highlight: "3 metrics",
      post: ".",
    });
    const p = container.querySelector("p")!;
    // innerHTML serializes the U+00A0 codepoint as the &nbsp; entity, so
    // assert on serialized HTML for "trimmed pre + NBSP + opening span".
    expect(p.innerHTML).toMatch(/Log your&nbsp;<span/);
    // Sanity: no leftover trailing space before the NBSP.
    expect(p.innerHTML).not.toMatch(/Log your &nbsp;<span/);
  });

  it("inserts NBSP between highlight and post when post has leading whitespace", () => {
    const { container } = renderHeader({
      type: "performance",
      status: "x",
      pre: "Currently",
      highlight: "tracking 3",
      post: " metrics.",
    });
    const p = container.querySelector("p")!;
    // Closing span, NBSP entity, then the trimmed post.
    expect(p.innerHTML).toMatch(/<\/span>&nbsp;metrics\./);
    expect(p.innerHTML).not.toMatch(/<\/span>&nbsp; metrics/);
  });

  it("does NOT insert NBSPs when pre/post don't have inner whitespace adjacent to highlight", () => {
    const { container } = renderHeader({
      type: "wellness",
      status: "x",
      pre: "[",
      highlight: "BANG",
      post: "]",
    });
    const p = container.querySelector("p")!;
    // Neither the raw NBSP codepoint (in textContent) nor the &nbsp;
    // entity (in serialized innerHTML) should appear.
    expect(p.textContent).not.toContain(NBSP);
    expect(p.innerHTML).not.toContain("&nbsp;");
    expect(p.textContent).toBe("[BANG]");
  });

  it("falls back to plain status text when no highlight is provided", () => {
    const { container } = renderHeader({
      type: "performance",
      status: "No perf. data logged today.",
    });
    const p = container.querySelector("p")!;
    expect(p.textContent).toBe("No perf. data logged today.");
    expect(p.querySelector("[class*='statusHighlight']")).toBeNull();
  });

  it("marks the link with data-skip-link-exclude so the global skip-link picker ignores it", () => {
    const { container } = renderHeader({ type: "wellness", status: "x" });
    expect(
      container.querySelector("a")!.getAttribute("data-skip-link-exclude"),
    ).not.toBeNull();
  });
});
