// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseNumericInput } from "./numericInput";

describe("parseNumericInput", () => {
  it("returns undefined for an empty string (clear)", () => {
    expect(parseNumericInput("")).toBeUndefined();
  });

  it("returns the finite number for a valid parse", () => {
    expect(parseNumericInput("42")).toBe(42);
    expect(parseNumericInput("4.5")).toBe(4.5);
  });

  it("stores 0 and negatives verbatim rather than clearing or ignoring", () => {
    expect(parseNumericInput("0")).toBe(0);
    expect(parseNumericInput("-3")).toBe(-3);
  });

  it("returns null for non-finite / mid-typed input (ignore)", () => {
    expect(parseNumericInput("-")).toBeNull();
    // A lone "." (and "-.") is NaN, not 0, so it is ignored like "-" - it never
    // stores a spurious 0 that would make the metric look filled.
    expect(parseNumericInput(".")).toBeNull();
    expect(parseNumericInput("-.")).toBeNull();
    expect(parseNumericInput("abc")).toBeNull();
    expect(parseNumericInput("1e")).toBeNull();
    expect(parseNumericInput("Infinity")).toBeNull();
  });

  it("parses partial-but-valid decimals rather than ignoring them", () => {
    // A leading or trailing dot on real digits IS a parseable number, unlike
    // the lone "." above.
    expect(parseNumericInput(".5")).toBe(0.5);
    expect(parseNumericInput("0.")).toBe(0);
    expect(parseNumericInput("1.")).toBe(1);
  });
});
