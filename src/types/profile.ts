export type Gender = "male" | "female" | "non-binary" | "unspecified";
export type AthleteType = "endurance" | "strength";

// Persisted per-section dashboard graph picks (DGT-64). Both fields are
// optional: a card writes only the leaf the user just changed, and seeds
// its local state from whichever leaves are present, falling back to the
// first tracked metric / "7d" otherwise. `range` is stored as a plain
// string (not TimeRangeKey) so this type stays decoupled from the
// dashboard component; the card validates it against the known keys on
// read and ignores a stale/unknown value.
export interface DashboardChartSettings {
  metric?: string;
  range?: string;
}

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
  // Optional during the transition to a 3-section model (DGT-51).
  // Like the other tracked* arrays, this field may be absent on
  // newly-created profile docs: ProfileForm doesn't initialize it
  // on first write and TrackedDataSetup only stamps it when the
  // user toggles a Performance metric. Consumers fall back to a
  // default — either PERFORMANCE_METRICS.map(m => m.id) (empty
  // today) or [] depending on the call site.
  trackedPerformanceMetrics?: string[];
  trackedCompetitionMetrics: string[];
  // Per-section dashboard graph picks (DGT-64). Optional, like the
  // tracked* arrays: absent on existing/newly-created docs, written
  // lazily the first time the user changes a card's metric or range.
  dashboardCharts?: {
    health?: DashboardChartSettings;
    performance?: DashboardChartSettings;
    competition?: DashboardChartSettings;
  };
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
