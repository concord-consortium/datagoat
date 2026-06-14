import type { UserProfile } from "../../types/profile";
import { profileSchema, type ProfileFormValues } from "./profileSchema";

// Maps the live profile form values to the subset of profile fields that is
// safe to auto-persist: only fields that currently pass schema validation are
// included (numeric strings coerced to numbers to match the stored
// UserProfile shape). A transiently-invalid field is simply omitted, so a
// setDoc(merge:true) writer leaves its last-good value untouched rather than
// clobbering it with a half-typed value.
export function profileAutosavePartial(
  values: ProfileFormValues,
): Partial<UserProfile> {
  const result = profileSchema.safeParse(values);
  const fieldErrors = result.success ? {} : result.error.flatten().fieldErrors;
  const valid = (f: keyof ProfileFormValues) => !fieldErrors[f];

  const out: Partial<UserProfile> = {};
  if (valid("fullName")) out.fullName = values.fullName;
  // nickname and competitionTerm are optional (always schema-valid).
  out.nickname = values.nickname ?? "";
  if (valid("age")) out.age = Number(values.age);
  // Height is a composite: persist the pair only when both inputs validate,
  // so a lone foot value never lands and reads downstream as e.g. 5'0".
  if (valid("heightFt") && valid("heightIn")) {
    out.heightFt = Number(values.heightFt);
    out.heightIn = Number(values.heightIn);
  }
  if (valid("weight")) out.weight = Number(values.weight);
  if (valid("gender")) out.gender = values.gender;
  if (valid("athleteType")) out.athleteType = values.athleteType;
  out.competitionTerm = values.competitionTerm ?? "";
  return out;
}
