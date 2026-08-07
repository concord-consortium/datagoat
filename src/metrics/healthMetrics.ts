import type { MetricDefinition } from "./types";
import HydrationIcon from "@/icons/metric-hydration.svg?react";
import SleepTimeIcon from "@/icons/metric-sleep-time.svg?react";
import SleepEfficiencyIcon from "@/icons/metric-sleep-efficiency.svg?react";
import ProteinIcon from "@/icons/metric-protein.svg?react";
import LeanMassIcon from "@/icons/metric-lean-mass.svg?react";
import AvailabilityIcon from "@/icons/metric-availability.svg?react";

// Mood is a 5-option ordinal scale (1=worst, 5=best), shown as blue cards with
// a sad->happy outline face icon per card (see icons/MoodFace). The `label`
// words are the screen-reader accessible name for each card; the stored value
// stays numeric 1..5. Card colors come from the fixed MOOD_HEXES built-in
// palette (see data/scaleColors). Defining levels in module scope keeps the
// registry entry below readable.
// Removed as a choice per DGT-87 (restore alongside the mood registry entry below).
// const MOOD_LEVELS = [
//   { label: "Very sad", value: 1 },
//   { label: "Sad", value: 2 },
//   { label: "Neutral", value: 3 },
//   { label: "Happy", value: 4 },
//   { label: "Very happy", value: 5 },
// ];

// Strings ported verbatim from the 2026-04-27 prototype's metricDetails
// table (whoCollects, howCollected, desc). Do not paraphrase - the prototype
// HTML at /home/doug/docs/datagoat-2026-04-27.html is the source of truth.
export const HEALTH_METRICS: MetricDefinition[] = [
  {
    id: "hydration",
    name: "Urine Color",
    unit: "level",
    type: "health",
    whoCollects: "Self",
    howCollected: "Morning urine color",
    Icon: HydrationIcon,
    description:
      "Urine color is a simple indicator of hydration status. Hydration reflects the relationship between fluid intake and fluid loss. Maintaining the proper hydration ensures we have enough total body water to maintain normal physiological function and homeostasis. We lose more water during exercise, therefore it is important we replenish fluids to stay hydrated. Optimal hydration is indicated by pale yellow, similar to lemonade. Darker yellow or amber indicates a need for water, while, conversely, completely clear urine may indicate overhydration. Use urine color as one tool to help monitor your hydration habits.",
    questionsToExplore:
      "Does exercise feel harder when urine color is darker? Are changes in hydration status associated with changes in workout performance? It may be interesting to track both urine color and perceived exertion over time to determine whether hydration status influences how hard exercise feels. Observing patterns between these measures over time may help you better understand how hydration impacts how you feel during your workout or competition.",
    min: 1,
    max: 8,
    inputType: "colorScale",
    learnMoreUrl: "https://pubmed.ncbi.nlm.nih.gov/9303999/",
    references: [
      {
        title: "NCAA Hydration Status Assessment",
        url: "https://ncaaorg.s3.amazonaws.com/ssi/nutrition/SSI_AssessHydration.pdf",
      },
    ],
    estimatedRange: "8 levels (pale yellow → dark yellow/amber)",
    whenCollected: "Daily",
    schedule: { period: "daily" },
  },
  {
    id: "sleepTime",
    name: "Total Sleep Time",
    unit: "hr/night",
    displayUnit: "hr",
    type: "health",
    whoCollects: "Self",
    howCollected:
      "You can monitor your sleep using a wearable device like an Oura Ring, Fitbit, or Whoop strap, or you can fill out a questionnaire like the Pittsburgh Sleep Quality Index (PSQI) or the Athlete Sleep Screening Questionnaire (ASSQ). Both are great options to track your sleep duration and efficiency.",
    description:
      "Total amount of time spent asleep during a sleep period, typically measured from sleep onset to final awakening, expressed in minutes or hours.",
    questionsToExplore:
      "Do you perform better after nights with more sleep? Does exercise feel harder after nights with less sleep? Does sleep duration differ between training days and competition days? It may be interesting to track sleep duration alongside measures like athletic performance, perceived exertion, and season timepoints such as in-season, off-season, pre-game, playoffs, etc. Observing patterns between these variables may help you identify whether better sleep is associated with improved performance or reduced effort during exercise, and how sleep varies across your season.",
    inputType: "numeric",
    timePrecision: "m",
    Icon: SleepTimeIcon,
    learnMoreUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6267703/",
    references: [
      {
        title: "PSQI (Pittsburgh Quality Sleep Index)",
        url: "https://drive.google.com/file/d/1mdkphTO2pRAnXzBJ0fJK1LgpU8MbYj9f/view",
      },
      {
        title: "ASSQ (Athlete Sleep Screening Questionnaire)",
        url: "https://drive.google.com/file/d/1y43OwBJOj8-nbaI0M4mzGZOOI2DXFRl2/view",
      },
      {
        title: "ASSQ Scoring Key",
        url: "https://docs.google.com/document/d/1VIiGo671Hs9t8PcKPdPZTe2oppCb7Ar8/edit",
      },
    ],
    hideEstimatedRange: true,
    whenCollected: "Daily",
    schedule: { period: "daily" },
  },
  {
    id: "sleepEfficiency",
    name: "Sleep Efficiency",
    unit: "%",
    type: "health",
    whoCollects: "Self",
    howCollected:
      "You can monitor your sleep using a wearable device like an Oura Ring, Fitbit, or Whoop strap, or you can fill out a questionnaire like the Pittsburgh Sleep Quality Index (PSQI) or the Athlete Sleep Screening Questionnaire (ASSQ). Both are great options to track your sleep duration and efficiency.",
    description:
      "Percentage of time spent asleep relative to the total time spent in bed attempting to sleep.\nSleep Efficiency = (Total Sleep Time/Total Time in Bed) × 100",
    questionsToExplore:
      "Do you perform better after nights with higher sleep efficiency? Does exercise feel harder after nights with lower sleep efficiency? Does sleep efficiency differ between training days and rest days? It may be interesting to track sleep efficiency alongside measures such as athletic performance, perceived exertion, and training status over time. Observing patterns between these variables may help you identify whether better sleep is associated with improved performance, reduced effort during exercise, or differences between training and rest days.",
    min: 0,
    max: 100,
    inputType: "numeric",
    Icon: SleepEfficiencyIcon,
    learnMoreUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9960533/",
    references: [
      {
        title: "PSQI (Pittsburgh Quality Sleep Index)",
        url: "https://drive.google.com/file/d/1mdkphTO2pRAnXzBJ0fJK1LgpU8MbYj9f/view",
      },
      {
        title: "ASSQ (Athlete Sleep Screening Questionnaire)",
        url: "https://drive.google.com/file/d/1y43OwBJOj8-nbaI0M4mzGZOOI2DXFRl2/view",
      },
      {
        title: "ASSQ Scoring Key",
        url: "https://docs.google.com/document/d/1VIiGo671Hs9t8PcKPdPZTe2oppCb7Ar8/edit",
      },
    ],
    hideEstimatedRange: true,
    whenCollected: "Daily",
    schedule: { period: "daily" },
  },
  {
    id: "protein",
    name: "Protein Intake",
    unit: "g/kg/day",
    displayUnit: "g",
    type: "health",
    whoCollects: "Self",
    howCollected:
      "Log protein intake (g)\nIn order to estimate protein intake, you may want to track your dietary intake for a “typical” weekday and weekend day with an app like Cronometer or MyFitnessPal. This way, you can better understand how much protein is in the foods you usually eat. Don’t forget to include supplements and/or shakes!",
    description:
      "Amount of dietary protein consumed to support metabolic processes like repair and recovery.",
    inputType: "numeric",
    Icon: ProteinIcon,
    learnMoreUrl: "https://bjsm.bmj.com/content/52/6/376",
    references: [
      {
        title: "NCAA Nutrition, Hydration & Sleep",
        url: "https://www.ncaa.org/sports/2016/8/4/nutrition-sleep-and-performance-educational-resources.aspx",
      },
      {
        title: "USOPC Nutrition",
        url: "https://www.usopc.org/nutrition",
      },
    ],
    estimatedRange: "0.6–3 g/kg/day (0.3–1.4 g/lb/day)",
    whenCollected: "Daily",
    schedule: { period: "daily" },
  },
  {
    id: "relativeProteinIntake",
    name: "Relative Protein Intake",
    unit: "g/kg",
    type: "health",
    whoCollects: "Auto-calculated",
    howCollected: "Derived from Protein Intake and Lean Mass.",
    description:
      "Daily protein intake relative to lean body mass (g/kg). Auto-calculated; the input on the log row is a placeholder until the derivation lands in a follow-up.",
    inputType: "numeric",
    estimatedRange: "0.6–3 g/kg/day",
    whenCollected: "Daily (auto)",
    schedule: { period: "daily" },
  },
  {
    id: "leanMass",
    name: "Lean Mass",
    unit: "kg",
    hint: "Entered 2-3×/yr",
    type: "health",
    whoCollects:
      "SC (Strength and Conditioning Coach), AT (Athletic Trainer), Nutrition",
    howCollected:
      "Skinfolds, BIA (Bioelectrical Impedance Analysis), BIS (Bioimpedance Spectroscopy), DXA (Dual-Energy X-ray Absorptiometry)",
    description:
      "Lean mass is all of your body's mass excluding fat mass. It includes muscle, bone, organs, connective tissue, and body water.",
    questionsToExplore:
      "Has lean mass increased, decreased, or remained stable since your last test? Are changes in lean mass related to improvements in strength, power, speed, or endurance? Is there a relationship between your protein intake and lean mass over time? It may be interesting to track lean mass over time to determine whether changes in body composition are related to changes in performance or nutritional habits. Comparing measurements across multiple assessments may help identify long-term trends related to training and lifestyle habits.",
    inputType: "numeric",
    Icon: LeanMassIcon,
    learnMoreUrl: "https://acsm.org/education-resources/books/fitness-assessment-manual/",
    hideEstimatedRange: true,
    whenCollected: "2–3×/year",
    // "2-3x/year" is a regular (if infrequent) cadence, not ad-hoc, so
    // it's yearly (count 2) rather than irregular - a single count can't
    // express the "2-3" range; 2 is the conservative floor.
    schedule: { period: "yearly", count: 2 },
  },
  {
    id: "availability",
    name: "Availability",
    unit: "%",
    type: "health",
    whoCollects: "AT (Athletic Trainer), Self",
    howCollected:
      "Each day, you’ll log whether you had a practice and/or a game and whether you participated. Your availability percentage — your unrestricted ability to participate in training and/or competition — will be calculated for the week.",
    description:
      "Percentage of time an athlete is able to participate for full training or competition without restrictions.",
    questionsToExplore:
      "Does your availability improve when recovery, sleep, and hydration habits are optimized? Are changes in your availability associated with injury, illness, or soreness? Do athletes with higher availability demonstrate better performance outcomes over time? Is there a relationship between your training volume or intensity and your availability the following week? It may be interesting to track your availability over time and compare it with training, recovery, health, and performance measures. Observing patterns may help identify factors that support consistent participation and readiness for training and competition.",
    inputType: "tree",
    Icon: AvailabilityIcon,
    learnMoreUrl: "https://pubmed.ncbi.nlm.nih.gov/32362281/",
    hideEstimatedRange: true,
    whenCollected: "Daily",
    schedule: { period: "daily" },
  },
  // Removed as a choice per DGT-87 (restore by uncommenting; also un-comment MOOD_LEVELS above).
  // Existing entries are orphaned.
  /*
  {
    id: "mood",
    name: "Mood",
    unit: "",
    type: "health",
    whoCollects: "Self",
    howCollected: "Self-report on a 1–5 scale at the end of the day.",
    description:
      "Subjective rating of overall mood for the day on a 1 (worst) to 5 (best) scale.",
    min: 1,
    max: 5,
    inputType: "ordinal",
    levels: MOOD_LEVELS,
    estimatedRange: "1–5",
    whenCollected: "Daily",
    schedule: { period: "daily" },
  },
  */
];
