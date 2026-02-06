export const SPORTS = [
  "baseball",
  "basketball",
  "football",
  "lacrosse",
  "track-and-field",
  "tennis",
] as const;

export type Sport = (typeof SPORTS)[number];

export const SPORT_LABELS: Record<Sport, string> = {
  baseball: "Baseball",
  basketball: "Basketball",
  football: "Football",
  lacrosse: "Lacrosse",
  "track-and-field": "Track & Field",
  tennis: "Tennis",
};

export const GENDERS = [
  "unspecified",
  "male",
  "female",
  "nonbinary",
] as const;

export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  unspecified: "Unspecified",
  male: "Male",
  female: "Female",
  nonbinary: "Nonbinary",
};

export interface Profile {
  schemaVersion: number;
  username: string;
  sport: Sport;
  weight: number;
  age: number;
  gender: Gender;
  dailySetupComplete: boolean;
  outcomesSetupComplete: boolean;
}
