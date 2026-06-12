import { describe, expect, it } from "vitest";
import { profileSchema, type ProfileFormValues } from "./profileSchema";

function baseValues(): ProfileFormValues {
  return {
    fullName: "Test Athlete",
    nickname: "",
    age: "18",
    heightFt: "5",
    heightIn: "9",
    weight: "150",
    gender: "unspecified",
    athleteType: "endurance",
    competitionTerm: "game",
  };
}

function expectFieldFailure(values: ProfileFormValues, field: string) {
  const result = profileSchema.safeParse(values);
  expect(result.success).toBe(false);
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join("."));
    expect(fields).toContain(field);
  }
}

describe("profileSchema numeric ranges", () => {
  it("accepts a fully-valid baseline", () => {
    expect(profileSchema.safeParse(baseValues()).success).toBe(true);
  });

  it("accepts age at the min and max", () => {
    expect(
      profileSchema.safeParse({ ...baseValues(), age: "5" }).success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({ ...baseValues(), age: "100" }).success,
    ).toBe(true);
  });

  it("rejects age below min and above max", () => {
    expectFieldFailure({ ...baseValues(), age: "4" }, "age");
    expectFieldFailure({ ...baseValues(), age: "101" }, "age");
  });

  it("accepts heightFt at the integer min and max", () => {
    expect(
      profileSchema.safeParse({ ...baseValues(), heightFt: "3" }).success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({ ...baseValues(), heightFt: "8" }).success,
    ).toBe(true);
  });

  it("rejects heightFt out of range", () => {
    expectFieldFailure({ ...baseValues(), heightFt: "2" }, "heightFt");
    expectFieldFailure({ ...baseValues(), heightFt: "9" }, "heightFt");
  });

  it("rejects fractional heightFt (integer constraint)", () => {
    expectFieldFailure({ ...baseValues(), heightFt: "5.5" }, "heightFt");
  });

  it("accepts heightIn at the min and max with sub-inch precision", () => {
    expect(
      profileSchema.safeParse({ ...baseValues(), heightIn: "0" }).success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({ ...baseValues(), heightIn: "11" }).success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({ ...baseValues(), heightIn: "10.5" }).success,
    ).toBe(true);
  });

  it("rejects heightIn out of range", () => {
    expectFieldFailure({ ...baseValues(), heightIn: "12" }, "heightIn");
  });

  it("accepts weight at the min and max", () => {
    expect(
      profileSchema.safeParse({ ...baseValues(), weight: "50" }).success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({ ...baseValues(), weight: "500" }).success,
    ).toBe(true);
  });

  it("rejects weight out of range", () => {
    expectFieldFailure({ ...baseValues(), weight: "49" }, "weight");
    expectFieldFailure({ ...baseValues(), weight: "501" }, "weight");
  });
});

describe("profileSchema required-string + enum validators", () => {
  it("rejects empty fullName", () => {
    expectFieldFailure({ ...baseValues(), fullName: "" }, "fullName");
  });

  it("accepts an empty competitionTerm (optional - defaults to game downstream)", () => {
    expect(
      profileSchema.safeParse({ ...baseValues(), competitionTerm: "" }).success,
    ).toBe(true);
  });

  it("rejects an empty gender (required - first-timers start unselected)", () => {
    expectFieldFailure(
      { ...baseValues(), gender: "" as ProfileFormValues["gender"] },
      "gender",
    );
  });

  it("rejects an empty athleteType (required - first-timers start unselected)", () => {
    expectFieldFailure(
      { ...baseValues(), athleteType: "" as ProfileFormValues["athleteType"] },
      "athleteType",
    );
  });

  it("rejects an unknown gender", () => {
    expectFieldFailure(
      { ...baseValues(), gender: "other" as ProfileFormValues["gender"] },
      "gender",
    );
  });
});
