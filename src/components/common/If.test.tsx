// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { If } from "./If";

describe("If", () => {
  it("renders its children when condition is true", () => {
    const { getByText } = render(
      <If condition={true}>
        <span>visible</span>
      </If>,
    );
    expect(getByText("visible")).toBeTruthy();
  });

  it("renders nothing when condition is false", () => {
    const { container } = render(
      <If condition={false}>
        <span>hidden</span>
      </If>,
    );
    expect(container.textContent).toBe("");
  });

  it("renders multiple children when condition is true", () => {
    const { getByText } = render(
      <If condition={true}>
        <span>one</span>
        <span>two</span>
      </If>,
    );
    expect(getByText("one")).toBeTruthy();
    expect(getByText("two")).toBeTruthy();
  });
});
