import { z } from "zod";

// Profile validation per spec: name required, age 5-100, height ft 3-8 +
// in 0-11, weight 50-500, gender required, athleteType required,
// competitionTerm required.
//
// Inputs are typed as text + numeric inputmode in the prototype (so the user
// gets a numeric keypad on iOS/Android without losing copy/paste); the schema
// coerces the string to a number so the writer hands typed data to Firestore.

const numericString = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((s) => /^\d+$/.test(s), `${label} must be a whole number`);

export const profileSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Please enter a valid email address"),
  // Optional nickname - default to empty string if blank rather than
  // undefined so the form value type stays string-only (avoids
  // Resolver<TInput, _, TOutput> divergence when the schema has a
  // default()).
  nickname: z.string(),
  age: numericString("Age").refine((s) => {
    const n = Number(s);
    return n >= 5 && n <= 100;
  }, "Age must be between 5 and 100"),
  heightFt: numericString("Height (ft)").refine((s) => {
    const n = Number(s);
    return n >= 3 && n <= 8;
  }, "Height in feet must be between 3 and 8"),
  heightIn: numericString("Height (in)").refine((s) => {
    const n = Number(s);
    return n >= 0 && n <= 11;
  }, "Height in inches must be between 0 and 11"),
  weight: numericString("Weight").refine((s) => {
    const n = Number(s);
    return n >= 50 && n <= 500;
  }, "Weight must be between 50 and 500 lbs"),
  gender: z.enum(["male", "female", "non-binary", "unspecified"], {
    message: "Please select a gender",
  }),
  athleteType: z.enum(["endurance", "strength"], {
    message: "Please select an athlete type",
  }),
  competitionTerm: z.string().min(1, "Please select a competition term"),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

export const COMPETITION_TERM_OPTIONS = [
  { value: "bout", label: "Bout" },
  { value: "game", label: "Game" },
  { value: "match", label: "Match" },
  { value: "meet", label: "Meet" },
  { value: "race", label: "Race" },
  { value: "regatta", label: "Regatta" },
  { value: "tournament", label: "Tournament" },
];

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non-binary", label: "Non-binary" },
  { value: "unspecified", label: "Unspecified" },
];

export const ATHLETE_TYPE_OPTIONS = [
  { value: "endurance", label: "Endurance" },
  { value: "strength", label: "Strength and Power" },
];
