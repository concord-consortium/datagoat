export const healthEntryFixtures = {
  1: {
    version: 1,
    date: "2026-04-15",
    hydration: 5,
    sleepTime: 7.5,
    sleepEfficiency: 88,
    protein: 1.5,
    leanMass: 75,
    availability: {
      practiceHeld: true,
      practiceParticipation: true, // played
      gameHeld: false,
      // gameParticipation omitted - gameHeld=false means participation
      // is meaningless and unanswered.
    },
  },
  legacy: {
    date: "2026-04-14",
    hydration: 4,
    sleepTime: 6.8,
    sleepEfficiency: 82,
    protein: 1.2,
    leanMass: 70,
    availability: {},
  },
} as const;
