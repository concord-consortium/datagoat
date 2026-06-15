import { z } from "zod";

// Profile validation per spec: name required; age 5-100; height ft 3-8
// (integer) + in 0-11; weight 50-500; gender required; athleteType
// required; competitionTerm optional (blank is valid - the app defaults an
// unset term to "game" everywhere it's consumed).
//
// Inputs are text + numeric/decimal inputmode (so the user gets the right
// on-screen keypad on iOS/Android without losing copy/paste). The schema only
// validates the string; the callers (ProfileForm onSubmit and
// profileAutosavePartial) coerce it to a number via Number() before writing
// the typed value to Firestore.

// Validates a numeric string from a type="text" + inputMode="numeric"/"decimal"
// input. The value arrives as a string (RHF default); we range-check it here by
// parsing with Number() inside refine(), but the schema stays a z.string() - the
// callers coerce to a number before the Firestore write. The pattern / maxLength
// hints on the inputs are bypassed by paste, autofill, and devtools, so the
// schema is the only enforcement seam.
const numericString = (
  label: string,
  opts: { min: number; max: number; integer?: boolean },
) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((s) => /^\d+(\.\d+)?$/.test(s), `${label} must be a number`)
    .refine((s) => {
      const n = Number(s);
      return n >= opts.min && n <= opts.max;
    }, `${label} must be between ${opts.min} and ${opts.max}`)
    .refine(
      (s) => !opts.integer || Number.isInteger(Number(s)),
      `${label} must be a whole number`,
    );

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
  age: numericString("Age", { min: 5, max: 100 }),
  // heightFt is paired with heightIn; a fractional foot would collide
  // with the inches field (5.5 ft vs 5 ft 6 in), so it's the lone
  // structural integer.
  heightFt: numericString("Height (ft)", { min: 3, max: 8, integer: true }),
  heightIn: numericString("Height (in)", { min: 0, max: 11 }),
  weight: numericString("Weight", { min: 50, max: 500 }),
  gender: z.enum(["male", "female", "non-binary", "unspecified"], {
    message: "Please select a gender",
  }),
  athleteType: z.enum(["endurance", "strength"], {
    message: "Please select an athlete type",
  }),
  // Optional per spec: the Competition Term defaults to "game" wherever it's
  // read (see data/competitionTerms.ts), so a blank selection is valid rather
  // than mandatory. Kept as a plain string (not .min(1)) so "" passes.
  competitionTerm: z.string(),
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
