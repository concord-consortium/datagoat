// Per-metric goal text rendered under MetricDetail's "Estimated Range"
// section. Ported verbatim from the prototype's showMetricDetail()
// (HTML around lines 6684-6721): static `goalValues` for metrics that
// don't vary by profile, plus `goalByProfile` for metrics keyed off
// gender/athleteType.
//
// Profile keys mirror the format used by PROFILE_CHART_GOALS:
// "${Gender}/${AthleteType}" with capitalized values (e.g.,
// "Male/Strength and Power"). The `[n]` placeholder appears in the
// prototype when a profile-keyed metric is missing a known mapping;
// MetricDetail renders the placeholder verbatim.

import { HEALTH_METRICS } from "../metrics/healthMetrics";

// metric.id -> static goal text (no profile dependency)
const STATIC_GOALS: Record<string, string> = {
  hydration: "to stay in the Hydrated range - pale yellow, levels 1-3",
  sleepTime: "to get 7-9 hours of sleep every night",
  availability:
    "to be available for more than 80% of your practices and {compTermPlural}",
  mood: "to rate your mood at 4 or higher on most days",
};

// metric.id -> profile-keyed goal text. Only the four built-in
// "${Gender}/${AthleteType}" keys are populated; profiles outside
// that set (Non-binary/*, Unspecified/*) render the prototype's
// literal "[n]" placeholder verbatim - the prototype's goalByProfile
// did not alias these, unlike PROFILE_CHART_GOALS.
const PROFILE_GOALS: Record<string, Record<string, string>> = {
  sleepEfficiency: {
    "Male/Strength and Power": "to aim for 75-95% sleep efficiency",
    "Male/Endurance": "to aim for 80-95% sleep efficiency",
    "Female/Strength and Power": "to aim for 70-85% sleep efficiency",
    "Female/Endurance": "to aim for 75-85% sleep efficiency",
  },
  protein: {
    "Male/Strength and Power":
      "to get 1.4-2.2 g of protein per kg of body weight each day (0.6-1.0 g/lb)",
    "Male/Endurance":
      "to get 1.2-1.6 g of protein per kg of body weight each day (0.5-0.7 g/lb)",
    "Female/Strength and Power":
      "to get 1.4-2.2 g of protein per kg of body weight each day (0.6-1.0 g/lb)",
    "Female/Endurance":
      "to get 1.2-1.6 g of protein per kg of body weight each day (0.5-0.7 g/lb)",
  },
  leanMass: {
    "Male/Strength and Power":
      "to keep your lean mass between 65-92 kg (143-203 lbs)",
    "Male/Endurance":
      "to keep your lean mass between 55-69 kg (121-152 lbs)",
    "Female/Strength and Power":
      "to keep your lean mass between 42-68 kg (93-150 lbs)",
    "Female/Endurance":
      "to keep your lean mass between 38-55 kg (84-121 lbs)",
  },
};

// Resolve the goal sentence for a given metric + profile context.
// Returns null if the metric has no known goal mapping (e.g., the
// competition placeholder set, or a tracking-only metric).
//
// `compTermPlural` substitutes into the Availability template - e.g.,
// "games" / "matches" / "meets" - so the wording matches the user's
// chosen competition term. Pass the registry's plural form; falls back
// to "games" when not provided.
export function resolveGoalText(
  metricId: string,
  profileKey: string,
  compTermPlural?: string,
): string | null {
  const staticTemplate = STATIC_GOALS[metricId];
  if (staticTemplate) {
    return staticTemplate.replace("{compTermPlural}", compTermPlural ?? "games");
  }
  const profileMap = PROFILE_GOALS[metricId];
  if (profileMap) {
    return profileMap[profileKey] ?? "[n]";
  }
  return null;
}

// Reference HEALTH_METRICS so a future "every health metric must
// have a goal mapping" assertion has a target. Currently used by
// MetricDetail only - competition metrics return null intentionally.
void HEALTH_METRICS;
