export const competitionEntryFixtures = {
  1: {
    version: 1,
    date: "2026-04-15",
    metrics: { wins: 1, losses: 0, goals: 2, assists: 1, yards: 0, tackles: 0 },
  },
  legacy: {
    date: "2026-04-14",
    metrics: { wins: 0, losses: 1, goals: 0, assists: 0, yards: 0, tackles: 0 },
  },
} as const;
