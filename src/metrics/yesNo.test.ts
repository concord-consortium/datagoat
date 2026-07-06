// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isYesNoLevels, YN_LEVELS } from "./yesNo";

describe("isYesNoLevels", () => {
  it("is true for the canonical No/Yes 0/1 preset", () => {
    expect(isYesNoLevels(YN_LEVELS)).toBe(true);
    expect(
      isYesNoLevels([
        { label: "No", value: 0 },
        { label: "Yes", value: 1 },
      ]),
    ).toBe(true);
  });

  it("is false for other level shapes", () => {
    expect(isYesNoLevels(undefined)).toBe(false);
    expect(
      isYesNoLevels([
        { label: "Low", value: 1 },
        { label: "High", value: 5 },
      ]),
    ).toBe(false); // 2 levels but not No/Yes
    expect(isYesNoLevels([{ label: "No", value: 0 }])).toBe(false); // 1 level
    expect(
      isYesNoLevels([
        { label: "No", value: 0 },
        { label: "Yes", value: 1 },
        { label: "Maybe", value: 2 },
      ]),
    ).toBe(false); // 3 levels
    expect(
      isYesNoLevels([
        { label: "Nope", value: 0 },
        { label: "Yep", value: 1 },
      ]),
    ).toBe(false); // wrong labels
  });
});
