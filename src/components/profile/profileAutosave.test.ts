import { describe, it, expect } from "vitest";
import { profileAutosavePartial } from "./profileAutosave";
import type { ProfileFormValues } from "./profileSchema";

function validValues(
  overrides: Partial<ProfileFormValues> = {},
): ProfileFormValues {
  return {
    fullName: "Test Athlete",
    nickname: "",
    age: "18",
    heightFt: "5",
    heightIn: "9",
    weight: "150",
    gender: "male",
    athleteType: "endurance",
    competitionTerm: "game",
    ...overrides,
  };
}

describe("profileAutosavePartial", () => {
  it("coerces numeric fields to numbers for a fully valid form", () => {
    expect(profileAutosavePartial(validValues())).toMatchObject({
      fullName: "Test Athlete",
      age: 18,
      heightFt: 5,
      heightIn: 9,
      weight: 150,
      gender: "male",
      athleteType: "endurance",
      competitionTerm: "game",
    });
  });

  it("omits fields that fail validation, keeping the valid ones", () => {
    const partial = profileAutosavePartial(
      validValues({ age: "200", weight: "9" }),
    );
    expect(partial).not.toHaveProperty("age");
    expect(partial).not.toHaveProperty("weight");
    expect(partial).toMatchObject({ heightFt: 5, gender: "male" });
  });

  it("omits BOTH height fields when only feet is entered (composite)", () => {
    const partial = profileAutosavePartial(
      validValues({ heightFt: "5", heightIn: "" }),
    );
    // Persisting a lone heightFt would read downstream as 5'0".
    expect(partial).not.toHaveProperty("heightFt");
    expect(partial).not.toHaveProperty("heightIn");
  });

  it("includes both height fields once the pair is valid", () => {
    const partial = profileAutosavePartial(
      validValues({ heightFt: "6", heightIn: "1" }),
    );
    expect(partial).toMatchObject({ heightFt: 6, heightIn: 1 });
  });

  it("omits unselected required selects (gender / athlete type)", () => {
    const partial = profileAutosavePartial(
      validValues({
        gender: "" as ProfileFormValues["gender"],
        athleteType: "" as ProfileFormValues["athleteType"],
      }),
    );
    expect(partial).not.toHaveProperty("gender");
    expect(partial).not.toHaveProperty("athleteType");
  });

  it("always includes the optional competitionTerm, even blank", () => {
    expect(profileAutosavePartial(validValues({ competitionTerm: "" })))
      .toMatchObject({ competitionTerm: "" });
  });
});
