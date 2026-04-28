import { z } from "zod";

// Profile validation per spec: name required, age 5-100, height ft 3-8 +
// in 0-11, weight 50-500, gender required, athleteType required,
// competitionTerm required.
//
// Inputs are typed as text + numeric inputmode in the prototype (so the user
// gets a numeric keypad on iOS/Android without losing copy/paste); the schema
// coerces the string to a number so the writer hands typed data to Firestore.

// Validates a numeric string from a <input type="number">. Required +
// non-negative, no upper bound. type="number" inputs surface their value
// as a string (RHF default), so we coerce + range-check here.
const numericString = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((s) => /^\d+(\.\d+)?$/.test(s), `${label} must be a number`)
    .refine((s) => Number(s) >= 0, `${label} must be 0 or greater`);

export const profileSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  // Email is NOT collected as a form field. Firebase Auth is the
  // canonical source (set during signup or OAuth); ProfileForm renders
  // it as read-only "Signed in as ..." muted text above the form. On
  // submit, the user's auth.email is copied into the Firestore profile
  // .email field for self-containment, but it's never editable here.
  // A future "change email" flow would go through Firebase's re-auth
  // + updateEmail() pattern in its own surface.
  // Optional nickname - default to empty string if blank rather than
  // undefined so the form value type stays string-only (avoids
  // Resolver<TInput, _, TOutput> divergence when the schema has a
  // default()).
  nickname: z.string(),
  age: numericString("Age"),
  heightFt: numericString("Height (ft)"),
  heightIn: numericString("Height (in)"),
  weight: numericString("Weight"),
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
