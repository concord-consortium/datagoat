// Versioned-keyed entries are migrated forward and asserted to land at the
// CURRENT_*_VERSION. The non-numeric `legacy` key carries the same shape as
// v1 but with no `version` field, exercising the framework's
// "missing version is treated as 1" path end-to-end for this doc shape.
export const userProfileFixtures = {
  1: {
    version: 1,
    fullName: "Test User",
    email: "test@example.com",
    nickname: "T",
    age: 20,
    heightFt: 6,
    heightIn: 0,
    weight: 180,
    gender: "male",
    athleteType: "strength",
    competitionTerm: "Game",
    trackedHealthMetrics: ["hydration"],
    trackedCompetitionMetrics: [],
    profileComplete: true,
    trackingSetupComplete: false,
  },
  legacy: {
    fullName: "Legacy User",
    email: "legacy@example.com",
    nickname: "",
    age: 19,
    heightFt: 5,
    heightIn: 11,
    weight: 170,
    gender: "female",
    athleteType: "endurance",
    competitionTerm: "Match",
    trackedHealthMetrics: [],
    trackedCompetitionMetrics: [],
    profileComplete: false,
    trackingSetupComplete: false,
  },
} as const;
