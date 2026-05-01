// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { AvailabilityTree } from "./AvailabilityTree";
import type { WellnessEntry } from "../../types/data";

type Avail = WellnessEntry["availability"];

const EMPTY: Avail = {
  practiceHeld: null,
  practiceParticipation: null,
  gameHeld: null,
  gameParticipation: null,
};

function renderTree(value: Avail) {
  const onChange = vi.fn<(next: Avail) => void>();
  const utils = render(
    <AvailabilityTree
      competitionTerm="game"
      value={value}
      onChange={onChange}
      labelledBy="lbl"
    />,
  );
  // Order matches the rendered tree: 0=practice Y, 1=practice N,
  // 2=practice participation Y, 3=practice participation N,
  // 4=game Y, 5=game N, 6=game participation Y, 7=game participation N.
  const radios = Array.from(
    utils.container.querySelectorAll("input[type='radio']"),
  ) as HTMLInputElement[];
  return { onChange, radios, ...utils };
}

describe("AvailabilityTree", () => {
  it("clears practiceParticipation when practiceHeld flips to false", () => {
    const { radios, onChange } = renderTree({
      ...EMPTY,
      practiceHeld: true,
      practiceParticipation: "played",
    });
    fireEvent.click(radios[1]); // practice N
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY,
      practiceHeld: false,
      practiceParticipation: null,
    });
  });

  it("clears gameParticipation when gameHeld flips to false", () => {
    const { radios, onChange } = renderTree({
      ...EMPTY,
      gameHeld: true,
      gameParticipation: "dnp",
    });
    fireEvent.click(radios[5]); // game N
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY,
      gameHeld: false,
      gameParticipation: null,
    });
  });

  it("preserves participation when practiceHeld flips to true", () => {
    const { radios, onChange } = renderTree({
      ...EMPTY,
      practiceHeld: false,
      practiceParticipation: null,
    });
    fireEvent.click(radios[0]); // practice Y
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY,
      practiceHeld: true,
      practiceParticipation: null,
    });
  });

  it("sets practiceParticipation when selected", () => {
    const { radios, onChange } = renderTree({
      ...EMPTY,
      practiceHeld: true,
    });
    fireEvent.click(radios[2]); // played
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY,
      practiceHeld: true,
      practiceParticipation: "played",
    });
  });

  it("sets gameParticipation to dnp when selected", () => {
    const { radios, onChange } = renderTree({
      ...EMPTY,
      gameHeld: true,
    });
    fireEvent.click(radios[7]); // game dnp
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY,
      gameHeld: true,
      gameParticipation: "dnp",
    });
  });
});
