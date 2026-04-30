export type Gender = "male" | "female" | "non-binary" | "unspecified";
export type AthleteType = "endurance" | "strength";

export interface UserProfile {
  version: number;
  fullName: string;
  email: string;
  nickname: string;
  age: number;
  heightFt: number;
  heightIn: number;
  weight: number;
  gender: Gender;
  athleteType: AthleteType;
  competitionTerm: string;
  trackedWellnessMetrics: string[];
  trackedPerformanceMetrics: string[];
  profileComplete: boolean;
  trackingSetupComplete: boolean;
}

export type ProfileLoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "loaded"; profile: UserProfile }
  // Snapshot subscription errored (transient network, permission denied,
  // etc.). Distinct from 'missing' so route guards render a retry UI
  // instead of dropping the user into onboarding - submitting the
  // onboarding form against a stale 'missing' would setDoc(merge:true)
  // over the user's real profile.
  | { status: "error"; error: unknown };
