import type { MetricDefinition } from "./types";

// Shared 1-N ordinal level builder. Used by Pain (0-10), Readiness
// (1-10), Soreness (1-5), Perceived Fatigue (1-5), Perceived Exertion
// (0-10). Labels are the numbers themselves; values mirror them.
function ordinalRange(min: number, max: number) {
  const out: Array<{ label: string; value: number }> = [];
  for (let n = min; n <= max; n++) {
    out.push({ label: String(n), value: n });
  }
  return out;
}

// Default-off Health metrics from DGT-51 design source ("Metrics" tab
// of the design spreadsheet). All start hidden; users opt in via the
// AddMetric flow. The categorical/ordinal entries reuse the generic
// "ordinal" inputType and OrdinalRadioGroup renderer; numeric entries
// fall through MetricInputRow's numeric branch.
export const ADDABLE_HEALTH: MetricDefinition[] = [
  {
    id: "hrv",
    name: "HRV",
    unit: "ms",
    type: "health",
    whoCollects: "Self",
    howCollected:
      "Wearable health monitor (e.g., Oura Ring, Whoop Band, Apple Watch).",
    description: "Changes in time intervals between consecutive heartbeats.",
    inputType: "numeric",
    estimatedRange: "20–200 ms",
    whenCollected: "Daily",
    schedule: { period: "daily" },
  },
  {
    id: "pain",
    name: "Pain",
    unit: "",
    type: "health",
    whoCollects: "Self",
    howCollected: "Self-report on a 0–10 scale.",
    description: "Subjective rating of pain on a 0 (none) to 10 (worst) scale.",
    min: 0,
    max: 10,
    inputType: "ordinal",
    levels: ordinalRange(0, 10),
    estimatedRange: "0–10",
    whenCollected: "Daily",
    schedule: { period: "daily" },
  },
  {
    id: "perceivedExertion",
    name: "Perceived Exertion",
    unit: "",
    type: "health",
    whoCollects: "Self",
    howCollected: "Self-report on a 0–10 scale after training.",
    description:
      "Subjective rating of effort during training on a 0 (none) to 10 (maximal) scale.",
    min: 0,
    max: 10,
    inputType: "ordinal",
    levels: ordinalRange(0, 10),
    estimatedRange: "0–10",
    whenCollected: "Daily",
    schedule: { period: "daily" },
  },
  {
    id: "perceivedFatigue",
    name: "Perceived Fatigue",
    unit: "",
    type: "health",
    whoCollects: "Self",
    howCollected: "Self-report on a 1–5 scale.",
    description:
      "Subjective rating of fatigue on a 1 (none) to 5 (extreme) scale.",
    min: 1,
    max: 5,
    inputType: "ordinal",
    levels: ordinalRange(1, 5),
    estimatedRange: "1–5",
    whenCollected: "Daily",
    schedule: { period: "daily" },
  },
  {
    id: "readiness",
    name: "Readiness",
    unit: "",
    type: "health",
    whoCollects: "Self",
    howCollected: "Self-report on a 1–10 scale.",
    description:
      "Subjective rating of readiness to train on a 1 (not ready) to 10 (peak) scale.",
    min: 1,
    max: 10,
    inputType: "ordinal",
    levels: ordinalRange(1, 10),
    estimatedRange: "1–10",
    whenCollected: "Daily",
    schedule: { period: "daily" },
  },
  {
    id: "soreness",
    name: "Soreness",
    unit: "",
    type: "health",
    whoCollects: "Self",
    howCollected: "Self-report on a 1–5 scale.",
    description:
      "Subjective rating of muscle soreness on a 1 (none) to 5 (severe) scale.",
    min: 1,
    max: 5,
    inputType: "ordinal",
    levels: ordinalRange(1, 5),
    estimatedRange: "1–5",
    whenCollected: "Daily",
    schedule: { period: "daily" },
  },
  {
    id: "overuseInjurySymptoms",
    name: "Overuse Injury Symptoms",
    unit: "",
    type: "health",
    whoCollects: "Self",
    howCollected: "Self-report of overuse injury symptoms.",
    description:
      "Self-reported symptoms of overuse injury (numeric severity / occurrence).",
    inputType: "numeric",
    whenCollected: "Daily",
    schedule: { period: "daily" },
  },
];

// Default-off Performance metrics from the same design source. All
// numeric; values are stored in `PerformanceEntry.metrics` (the
// generic map this entry type uses for both built-ins and customs)
// until the built-ins-to-Firestore migration reshapes storage.
export const ADDABLE_PERFORMANCE: MetricDefinition[] = [
  {
    id: "oneRepMaxBench",
    name: "1 Rep Max Bench Press",
    unit: "kg or lbs",
    type: "performance",
    whoCollects: "Self, S&C (Strength & Conditioning Coach)",
    howCollected: "Total load in lbs or kgs.",
    description:
      "The maximum load achievable for 1 repetition of barbell bench press through a full range of motion.",
    inputType: "numeric",
  },
  {
    id: "oneRepMaxDeadlift",
    name: "1 Rep Max Deadlift",
    unit: "kg or lbs",
    type: "performance",
    whoCollects: "Self, S&C (Strength & Conditioning Coach)",
    howCollected: "Total load in lbs or kgs.",
    description:
      "The maximum load achievable for 1 repetition of barbell deadlift through a full range of motion.",
    inputType: "numeric",
  },
  {
    id: "oneRepMaxHangClean",
    name: "1 Rep Max Hang Clean",
    unit: "kg or lbs",
    type: "performance",
    whoCollects: "Self, S&C (Strength & Conditioning Coach)",
    howCollected: "Total load in lbs or kgs.",
    description:
      "The maximum load achievable for 1 repetition of barbell hang clean through a full range of motion.",
    inputType: "numeric",
  },
  {
    id: "oneRepMaxPowerClean",
    name: "1 Rep Max Power Clean",
    unit: "kg or lbs",
    type: "performance",
    whoCollects: "Self, S&C (Strength & Conditioning Coach)",
    howCollected: "Total load in lbs or kgs.",
    description:
      "The maximum load achievable for 1 repetition of a barbell power clean through a full range of motion.",
    inputType: "numeric",
  },
  {
    id: "oneRepMaxSquat",
    name: "1 Rep Max Squat",
    unit: "kg or lbs",
    type: "performance",
    whoCollects: "Self, S&C (Strength & Conditioning Coach)",
    howCollected: "Total load in lbs or kgs.",
    description:
      "The maximum load achievable for 1 repetition of barbell back squat through a full range of motion.",
    inputType: "numeric",
  },
  {
    id: "oneMileRun",
    name: "1-Mile Run",
    unit: "min",
    type: "performance",
    whoCollects: "Team, S&C (Strength & Conditioning Coach)",
    howCollected: "Track.",
    description:
      "Field test of cardiorespiratory endurance: time to run one mile (1.6 km).",
    inputType: "numeric",
    estimatedRange: "4–15 min",
    whenCollected: "Quarterly",
    // Quarterly == 4x per year.
    schedule: { period: "yearly", count: 4 },
  },
  {
    id: "tenMeterSprint",
    name: "10-Meter Sprint",
    unit: "sec",
    type: "performance",
    whoCollects: "Team, S&C (Strength & Conditioning Coach)",
    howCollected: "Tape measure, timer, laser.",
    description:
      "Athlete's ability to accelerate and how quickly they perform a 10-meter sprint.",
    inputType: "numeric",
    estimatedRange: "1–3 sec",
    whenCollected: "Quarterly",
    // Quarterly == 4x per year.
    schedule: { period: "yearly", count: 4 },
  },
  {
    id: "fortyYardDash",
    name: "40-Yard Dash",
    unit: "sec",
    type: "performance",
    whoCollects: "Team, S&C (Strength & Conditioning Coach)",
    howCollected: "Laser, timer.",
    description:
      "Sprint test of short-distance speed and acceleration: 40 yards (36.6 m) from a stationary start.",
    inputType: "numeric",
    estimatedRange: "4.2–10 sec",
    whenCollected: "Quarterly",
    // Quarterly == 4x per year.
    schedule: { period: "yearly", count: 4 },
  },
  {
    id: "averageVelocity",
    name: "Average Velocity",
    unit: "m/s or mph",
    type: "performance",
    whoCollects: "S&C (Strength & Conditioning Coach), Sports Scientist",
    howCollected: "GPS unit, analyzed after collection.",
    description: "Total distance divided by total time in a session or drill.",
    inputType: "numeric",
  },
  {
    id: "beepTest",
    name: "Beep Test",
    unit: "levels",
    type: "performance",
    whoCollects: "Self, Team",
    howCollected: "Levels of beep and shuttle number.",
    description:
      "Maximal test involving continuous running between two lines 20 m apart in time to recorded beeps.",
    inputType: "numeric",
    estimatedRange: "1–21 levels",
    whenCollected: "Quarterly",
    // Quarterly == 4x per year.
    schedule: { period: "yearly", count: 4 },
  },
  {
    id: "deceleration",
    name: "Deceleration",
    unit: "m/s or mph",
    type: "performance",
    whoCollects: "S&C (Strength & Conditioning Coach), Sports Scientist",
    howCollected: "GPS unit with tri-axial accelerometer.",
    description: "Rate at which the athlete decreases speed.",
    inputType: "numeric",
  },
  {
    id: "distance",
    name: "Distance",
    unit: "m or mi",
    type: "performance",
    whoCollects: "S&C (Strength & Conditioning Coach), Sports Scientist",
    howCollected: "GPS unit, analyzed after collection.",
    description: "Total distance traveled in a session.",
    inputType: "numeric",
  },
  {
    id: "forwardAcceleration",
    name: "Forward Acceleration",
    unit: "m/s or mph",
    type: "performance",
    whoCollects: "S&C (Strength & Conditioning Coach), Sports Scientist",
    howCollected: "GPS unit with tri-axial accelerometer.",
    description:
      "Rate of change of velocity in the horizontal plane (start at rest or in motion, change of direction).",
    inputType: "numeric",
  },
  {
    id: "heartRateZone",
    name: "Heart Rate Zone",
    unit: "bpm",
    type: "performance",
    whoCollects: "Self, S&C (Strength & Conditioning Coach)",
    howCollected:
      "Wearable heart rate monitor (e.g., Polar HR, Whoop Band).",
    description:
      "HR zones: Z1 50–60% / Z2 60–70% / Z3 70–80% / Z4 80–90% / Z5 90–100% of Max HR.",
    inputType: "numeric",
  },
  {
    id: "peakVelocity",
    name: "Peak Velocity",
    unit: "m/s or mph",
    type: "performance",
    whoCollects: "S&C (Strength & Conditioning Coach), Sports Scientist",
    howCollected: "GPS unit, analyzed after collection.",
    description: "Highest velocity achieved in a session or specific drill.",
    inputType: "numeric",
  },
  {
    id: "reactiveStrengthIndex",
    name: "Reactive Strength Index",
    unit: "",
    type: "performance",
    whoCollects: "Self, S&C (Strength & Conditioning Coach)",
    howCollected: "Countermovement jump (CMJ); jump height ÷ time to takeoff.",
    description:
      "RSI-modified: ratio of jump height to movement time, an indicator of lower-body explosive ability.",
    inputType: "numeric",
  },
  {
    id: "standingBroadJump",
    name: "Standing Broad Jump",
    unit: "cm",
    type: "performance",
    whoCollects: "Self, S&C (Strength & Conditioning Coach)",
    howCollected: "Tape measure or board mat.",
    description:
      "Field test of lower-body explosive power: jump forward from a stationary standing position.",
    inputType: "numeric",
    estimatedRange: "100–350 cm",
    whenCollected: "Quarterly",
    // Quarterly == 4x per year.
    schedule: { period: "yearly", count: 4 },
  },
  {
    id: "upwardAcceleration",
    name: "Upward Acceleration",
    unit: "m/s or mph",
    type: "performance",
    whoCollects: "S&C (Strength & Conditioning Coach), Sports Scientist",
    howCollected: "GPS unit with tri-axial accelerometer.",
    description: "Rate of change of velocity in the vertical plane (jumping/landing).",
    inputType: "numeric",
  },
  {
    id: "verticalJump",
    name: "Vertical Jump",
    unit: "in",
    type: "performance",
    whoCollects: "Team, S&C (Strength & Conditioning Coach)",
    howCollected: "Vertec.",
    description:
      "Assessment of lower-body explosive power: how high an athlete jumps vertically from a standing position.",
    inputType: "numeric",
    estimatedRange: "1–50 in",
    whenCollected: "Quarterly",
    // Quarterly == 4x per year.
    schedule: { period: "yearly", count: 4 },
  },
];

// Default-off Competition metrics from the same design source. The
// previously-default-on assists/yards/tackles move here (per sheet
// "Comp" rows marked FALSE for "Displayed in default set"); the three
// genuinely-new metrics (Rebounds, Blocks, Digs) are also added.
// "Yards" updates to the multi-position framing from the sheet.
export const ADDABLE_COMPETITION: MetricDefinition[] = [
  {
    id: "assists",
    name: "Assists",
    unit: "",
    type: "competition",
    whoCollects: "Self",
    howCollected: "Log per game.",
    description: "Assists recorded.",
    inputType: "numeric",
  },
  {
    id: "tackles",
    name: "Tackles",
    unit: "",
    type: "competition",
    whoCollects: "Self",
    howCollected: "Log per game.",
    description: "Tackles made.",
    inputType: "numeric",
  },
  {
    id: "yards",
    name: "Yards (receiving/rushing/passing)",
    unit: "yd",
    type: "competition",
    whoCollects: "Self",
    howCollected: "Log per game.",
    description: "Total yards (receiving / rushing / passing).",
    inputType: "numeric",
  },
  {
    id: "rebounds",
    name: "Rebounds",
    unit: "",
    type: "competition",
    whoCollects: "Self",
    howCollected: "Log per game.",
    description: "Rebounds recorded.",
    inputType: "numeric",
  },
  {
    id: "blocks",
    name: "Blocks",
    unit: "",
    type: "competition",
    whoCollects: "Self",
    howCollected: "Log per game.",
    description: "Blocks recorded.",
    inputType: "numeric",
  },
  {
    id: "digs",
    name: "Digs",
    unit: "",
    type: "competition",
    whoCollects: "Self",
    howCollected: "Log per game.",
    description: "Digs recorded.",
    inputType: "numeric",
  },
];
