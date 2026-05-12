// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { AvailabilityTree } from "./AvailabilityTree";
import type { HealthEntry } from "../../types/data";

type Avail = HealthEntry["availability"];

const EMPTY: Avail = {};

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
  // Order matches the rendered tree. Participation radios are only mounted
  // when the corresponding held=true, so indices shift with `value`.
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
      practiceParticipation: true,
    });
    fireEvent.click(radios[1]); // practice N
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY,
      practiceHeld: false,
      practiceParticipation: undefined,
    });
  });

  it("clears gameParticipation when gameHeld flips to false", () => {
    const { radios, onChange } = renderTree({
      ...EMPTY,
      gameHeld: true,
      gameParticipation: false,
    });
    // 0=practice Y, 1=practice N, 2=game Y, 3=game N, 4=game played, 5=game dnp
    fireEvent.click(radios[3]); // game N
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY,
      gameHeld: false,
      gameParticipation: undefined,
    });
  });

  it("preserves participation when practiceHeld flips to true", () => {
    const { radios, onChange } = renderTree({
      ...EMPTY,
      practiceHeld: false,
    });
    fireEvent.click(radios[0]); // practice Y
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY,
      practiceHeld: true,
      practiceParticipation: undefined,
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
      practiceParticipation: true,
    });
  });

  it("sets gameParticipation to dnp when selected", () => {
    const { radios, onChange } = renderTree({
      ...EMPTY,
      gameHeld: true,
    });
    // 0=practice Y, 1=practice N, 2=game Y, 3=game N, 4=game played, 5=game dnp
    fireEvent.click(radios[5]); // game dnp
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY,
      gameHeld: true,
      gameParticipation: false,
    });
  });
});
