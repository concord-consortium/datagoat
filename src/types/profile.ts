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
  | { status: "loaded"; profile: UserProfile };
