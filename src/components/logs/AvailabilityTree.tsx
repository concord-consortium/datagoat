import { useId } from "react";
import { getCompTermLabel, getCompTermLowerLabel } from "../../data/competitionTerms";
import css from "./AvailabilityTree.module.css";
import type { WellnessEntry } from "../../types/data";

type AvailabilityValue = WellnessEntry["availability"];

export interface AvailabilityTreeProps {
  competitionTerm: string;
  value: AvailabilityValue;
  onChange: (next: AvailabilityValue) => void;
  labelledBy: string;
}

// Nested yes/no tree per requirements:
//   "Did you have practice today? Y/N"  -> if Y, "Did you participate? Y/N"
//   "Did you have a {game} today? Y/N"  -> if Y, "Did you participate? Y/N"
// Sub-value `played` = participated, `dnp` = did not participate.
//
// {game} substitutes the user's competitionTerm; in tight contexts the
// abbreviated form is used (e.g., 'tournament' -> 'Tourn.').
export function AvailabilityTree({
  competitionTerm,
  value,
  onChange,
  labelledBy,
}: AvailabilityTreeProps) {
  const gameLabel = getCompTermLabel(competitionTerm);
  const gameLower = getCompTermLowerLabel(competitionTerm);

  // role=radiogroup + aria-labelledby gives each Y/N pair a programmatic
  // group name. Without this, screen readers announce "Y radio" / "N
  // radio" with no question context. Using radiogroup (rather than a
  // bare fieldset) preserves the prototype's flex-row CSS - fieldsets
  // default to display:block and would require reworking the layout.
  const reactId = useId();
  const practiceHeldLabelId = `${reactId}-practice-held`;
  const practiceParticipationLabelId = `${reactId}-practice-part`;
  const gameHeldLabelId = `${reactId}-game-held`;
  const gameParticipationLabelId = `${reactId}-game-part`;

  function setPracticeHeld(held: boolean) {
    onChange({
      ...value,
      practiceHeld: held,
      // Clear participation when switching to "no practice" - the field
      // becomes meaningless.
      practiceParticipation: held ? value.practiceParticipation : null,
    });
  }
  function setPracticeParticipation(p: "played" | "dnp") {
    onChange({ ...value, practiceParticipation: p });
  }
  function setGameHeld(held: boolean) {
    onChange({
      ...value,
      gameHeld: held,
      gameParticipation: held ? value.gameParticipation : null,
    });
  }
  function setGameParticipation(p: "played" | "dnp") {
    onChange({ ...value, gameParticipation: p });
  }

  return (
    <div className={css.availGroup} role="group" aria-labelledby={labelledBy}>
      <span className={css.availHelper}>
        Did you have practice and/or a{" "}
        <span>{gameLower}</span> today?
      </span>
      <div
        className={`${css.availOption} ${value.practiceHeld === true ? css.availOpen : ""}`}
      >
        <div
          className={css.availRow}
          role="radiogroup"
          aria-labelledby={practiceHeldLabelId}
        >
          <span id={practiceHeldLabelId} className={css.availRowLabel}>
            Practice
          </span>
          <label className={css.availYnLabel}>
            <input
              type="radio"
              className={css.availRadio}
              name="avail-practice-yn"
              value="yes"
              checked={value.practiceHeld === true}
              onChange={() => setPracticeHeld(true)}
            />{" "}
            Y
          </label>
          <label className={css.availYnLabel}>
            <input
              type="radio"
              className={css.availRadio}
              name="avail-practice-yn"
              value="no"
              checked={value.practiceHeld === false}
              onChange={() => setPracticeHeld(false)}
            />{" "}
            N
          </label>
        </div>
        <div
          className={css.availSubs}
          role="radiogroup"
          aria-labelledby={practiceParticipationLabelId}
        >
          <span
            id={practiceParticipationLabelId}
            className={css.availSubPrompt}
          >
            Did you participate?
          </span>
          <label className={css.availSubLabel}>
            <input
              type="radio"
              className={css.availRadio}
              name="avail-practice-status"
              value="played"
              checked={value.practiceParticipation === "played"}
              onChange={() => setPracticeParticipation("played")}
            />{" "}
            Y
          </label>
          <label className={css.availSubLabel}>
            <input
              type="radio"
              className={css.availRadio}
              name="avail-practice-status"
              value="dnp"
              checked={value.practiceParticipation === "dnp"}
              onChange={() => setPracticeParticipation("dnp")}
            />{" "}
            N
          </label>
        </div>
      </div>
      <hr className={css.availDivider} />
      <div
        className={`${css.availOption} ${value.gameHeld === true ? css.availOpen : ""}`}
      >
        <div
          className={css.availRow}
          role="radiogroup"
          aria-labelledby={gameHeldLabelId}
        >
          <span id={gameHeldLabelId} className={css.availRowLabel}>
            {gameLabel}
          </span>
          <label className={css.availYnLabel}>
            <input
              type="radio"
              className={css.availRadio}
              name="avail-game-yn"
              value="yes"
              checked={value.gameHeld === true}
              onChange={() => setGameHeld(true)}
            />{" "}
            Y
          </label>
          <label className={css.availYnLabel}>
            <input
              type="radio"
              className={css.availRadio}
              name="avail-game-yn"
              value="no"
              checked={value.gameHeld === false}
              onChange={() => setGameHeld(false)}
            />{" "}
            N
          </label>
        </div>
        <div
          className={css.availSubs}
          role="radiogroup"
          aria-labelledby={gameParticipationLabelId}
        >
          <span
            id={gameParticipationLabelId}
            className={css.availSubPrompt}
          >
            Did you participate?
          </span>
          <label className={css.availSubLabel}>
            <input
              type="radio"
              className={css.availRadio}
              name="avail-game-status"
              value="played"
              checked={value.gameParticipation === "played"}
              onChange={() => setGameParticipation("played")}
            />{" "}
            Y
          </label>
          <label className={css.availSubLabel}>
            <input
              type="radio"
              className={css.availRadio}
              name="avail-game-status"
              value="dnp"
              checked={value.gameParticipation === "dnp"}
              onChange={() => setGameParticipation("dnp")}
            />{" "}
            N
          </label>
        </div>
      </div>
    </div>
  );
}
