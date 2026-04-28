// Ported verbatim from window._profileVariants and window._profileChartGoals
// in /home/doug/docs/datagoat-2026-04-27.html. The (Gender)/(AthleteType) keys
// are preserved exactly - the dynamic data flow keys off these strings.

export interface ProfileVariant {
  age: string;
  heightFt: string;
  heightIn: string;
  bodyWeight: string;
  sleepEff: string[];
  sleepEffToday: string;
  protein: string[];
  proteinToday: string;
  leanMass: string[];
  leanMassToday: string;
}

export interface ChartGoals {
  sleepEffGoal: number;
  sleepEffGoalLabel: string;
  proteinGoal: number;
  proteinGoalPct: number;
  proteinGoalLabel: string;
  proteinMax: number;
  proteinYTop: string;
  proteinYMid: string;
  leanMassGoal: number;
  leanMassMax: number;
  leanMassGoalPct: number;
  leanMassGoalLabel: string;
  leanMassYTop: string;
  leanMassYMid: string;
}

const maleStrength: ProfileVariant = {
  age: "20", heightFt: "6", heightIn: "1", bodyWeight: "205",
  sleepEff:  ["85","73","","80","72","","82","90","75","68","","86","","84","91","72","80","","73","85","82","","72","83","","86","","71","90",""],
  sleepEffToday: "89",
  protein:   ["1.5","1.3","","1.6","","","1.2","1.6","1.9","1.1","1.5","1.7","","1.8","1.6","1.2","","","1.2","1.7","1.6","1.8","1.3","1.5","1.1","1.6","","1.2","1.7",""],
  proteinToday: "1.78",
  leanMass:  ["","","","","","","","","","","","","","","78","","","","","","","","","","","","","","",""],
  leanMassToday: "",
};

const maleEndurance: ProfileVariant = {
  age: "20", heightFt: "5", heightIn: "10", bodyWeight: "154",
  sleepEff:  ["88","78","","84","76","","86","93","77","75","","89","","87","94","78","85","","79","88","86","","77","87","","90","","82","92",""],
  sleepEffToday: "91",
  protein:   ["1.3","1.1","","1.4","","","1.0","1.4","1.6","1.0","1.3","1.5","","1.5","1.4","1.0","","","1.1","1.4","1.1","1.5","1.1","1.3","1.0","1.4","","1.2","1.5",""],
  proteinToday: "1.42",
  leanMass:  ["","","","","","","","","","","","","","","62","","","","","","","","","","","","","","",""],
  leanMassToday: "",
};

const femaleStrength: ProfileVariant = {
  age: "20", heightFt: "5", heightIn: "8", bodyWeight: "154",
  sleepEff:  ["78","68","","74","65","","76","83","67","62","","79","","77","84","69","74","","66","78","75","","72","77","","80","","68","83",""],
  sleepEffToday: "81",
  protein:   ["1.5","1.2","","1.7","","","1.3","1.6","2.0","1.3","1.5","1.8","","1.9","1.6","1.2","","","1.3","1.7","1.3","1.8","1.4","1.6","1.3","1.5","","1.3","1.7",""],
  proteinToday: "1.72",
  leanMass:  ["","","","","","","","","","","","","","","55","","","","","","","","","","","","","","",""],
  leanMassToday: "",
};

const femaleEndurance: ProfileVariant = {
  age: "20", heightFt: "5", heightIn: "5", bodyWeight: "126",
  sleepEff:  ["80","73","","77","73","","79","84","74","70","","81","","79","84","73","77","","71","80","78","","75","79","","82","","74","83",""],
  sleepEffToday: "82",
  protein:   ["1.3","1.1","","1.4","","","1.0","1.3","1.5","1.0","1.0","1.4","","1.5","1.3","1.2","","","1.0","1.4","1.1","1.5","1.1","1.3","1.0","1.3","","1.2","1.4",""],
  proteinToday: "1.35",
  leanMass:  ["","","","","","","","","","","","","","","46","","","","","","","","","","","","","","",""],
  leanMassToday: "",
};

// Non-binary and Unspecified fall back to Male variants until content design
// provides goals (matches prototype's null-then-fallback pattern).
export const PROFILE_VARIANTS: Record<string, ProfileVariant> = {
  "Male/Strength and Power": maleStrength,
  "Male/Endurance": maleEndurance,
  "Female/Strength and Power": femaleStrength,
  "Female/Endurance": femaleEndurance,
  "Non-binary/Strength and Power": maleStrength,
  "Non-binary/Endurance": maleEndurance,
  "Unspecified/Strength and Power": maleStrength,
  "Unspecified/Endurance": maleEndurance,
};

const maleStrengthGoals: ChartGoals = {
  sleepEffGoal: 75, sleepEffGoalLabel: "75%",
  proteinGoal: 1.4, proteinGoalPct: 56, proteinGoalLabel: "1.4", proteinMax: 2.5, proteinYTop: "2.5", proteinYMid: "1.25",
  leanMassGoal: 65, leanMassMax: 100, leanMassGoalPct: 65, leanMassGoalLabel: "65 kg", leanMassYTop: "100 kg", leanMassYMid: "50 kg",
};

const maleEnduranceGoals: ChartGoals = {
  sleepEffGoal: 80, sleepEffGoalLabel: "80%",
  proteinGoal: 1.2, proteinGoalPct: 60, proteinGoalLabel: "1.2", proteinMax: 2.0, proteinYTop: "2.0", proteinYMid: "1.0",
  leanMassGoal: 55, leanMassMax: 80, leanMassGoalPct: 69, leanMassGoalLabel: "55 kg", leanMassYTop: "80 kg", leanMassYMid: "40 kg",
};

const femaleStrengthGoals: ChartGoals = {
  sleepEffGoal: 70, sleepEffGoalLabel: "70%",
  proteinGoal: 1.4, proteinGoalPct: 56, proteinGoalLabel: "1.4", proteinMax: 2.5, proteinYTop: "2.5", proteinYMid: "1.25",
  leanMassGoal: 42, leanMassMax: 80, leanMassGoalPct: 53, leanMassGoalLabel: "42 kg", leanMassYTop: "80 kg", leanMassYMid: "40 kg",
};

const femaleEnduranceGoals: ChartGoals = {
  sleepEffGoal: 75, sleepEffGoalLabel: "75%",
  proteinGoal: 1.2, proteinGoalPct: 60, proteinGoalLabel: "1.2", proteinMax: 2.0, proteinYTop: "2.0", proteinYMid: "1.0",
  leanMassGoal: 38, leanMassMax: 65, leanMassGoalPct: 58, leanMassGoalLabel: "38 kg", leanMassYTop: "65 kg", leanMassYMid: "33 kg",
};

export const PROFILE_CHART_GOALS: Record<string, ChartGoals> = {
  "Male/Strength and Power": maleStrengthGoals,
  "Male/Endurance": maleEnduranceGoals,
  "Female/Strength and Power": femaleStrengthGoals,
  "Female/Endurance": femaleEnduranceGoals,
  "Non-binary/Strength and Power": maleStrengthGoals,
  "Non-binary/Endurance": maleEnduranceGoals,
  "Unspecified/Strength and Power": maleStrengthGoals,
  "Unspecified/Endurance": maleEnduranceGoals,
};

export const DEFAULT_PROFILE_KEY = "Male/Strength and Power";
