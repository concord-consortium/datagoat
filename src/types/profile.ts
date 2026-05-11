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
  trackedHealthMetrics: string[];
  trackedCompetitionMetrics: string[];
  profileComplete: boolean;
  trackingSetupComplete: boolean;
}

// 'subscription' = onSnapshot errored (transient network, permission denied).
// 'migration' = the profile doc loaded but migrateDocument threw. Distinct so
// the retry UI can render honest copy: subscription errors are typically
// transient and benefit from retry; migration errors point at corrupt data
// and need support escalation. Both block the onboarding-form route guards
// to prevent setDoc(merge:true) from clobbering the unmigrated doc.
export type ProfileLoadErrorKind = "subscription" | "migration";

export type ProfileLoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "loaded"; profile: UserProfile }
  | { status: "error"; error: unknown; kind: ProfileLoadErrorKind };
