import { useUser } from "../contexts/UserContext";

export type OnboardingPhase = "ready" | "pre-profile" | "pre-tracking";

export interface OnboardingGate {
  /** The user's current onboarding step (or "ready" once fully onboarded). */
  phase: OnboardingPhase;
  /** True while any onboarding step is still incomplete. */
  isOnboarding: boolean;
  /** Whether the given route path is navigable in the current phase. */
  isReachable: (to: string) => boolean;
}

// Shared onboarding gate. The phase derivation and reachability rules live here
// so the hamburger menu (which dims unreachable items) and the section heading
// (which disables the Home/Dashboard button) agree on a single source of truth
// instead of each re-deriving the logic.
//
// Narrowed onboarding gate per spec:
//   loading -> phase='ready' (showing all items briefly is the right failure
//              mode; this hook runs outside ProtectedRoute, so this branch
//              fires during the brief Firestore-fetch window on cold start. A
//              flash of disabled items would be more disruptive than a flash of
//              unlocked ones.)
//   missing -> phase='pre-profile' (new user; only /profile reachable)
//   loaded  -> phase reflects the next incomplete onboarding step so the user
//              can reach the page they need to finish. /setup/tracking unlocks
//              once profileComplete is true, even before trackingSetupComplete -
//              otherwise a partway-onboarded user can't reach the page they need
//              to finish onboarding.
export function useOnboardingGate(): OnboardingGate {
  const { loadState } = useUser();

  const phase: OnboardingPhase =
    loadState.status === "missing"
      ? "pre-profile"
      : loadState.status === "loaded"
        ? !loadState.profile.profileComplete
          ? "pre-profile"
          : !loadState.profile.trackingSetupComplete
            ? "pre-tracking"
            : "ready"
        : "ready";

  const isOnboarding = phase !== "ready";

  function isReachable(to: string): boolean {
    if (!isOnboarding) return true;
    if (to === "/profile") return true;
    if (to === "/setup/tracking" && phase === "pre-tracking") return true;
    // About is version info + credits; it has no profile / tracking
    // prerequisite, so let users reach it from the menu even mid-onboarding.
    if (to === "/about") return true;
    return false;
  }

  return { phase, isOnboarding, isReachable };
}
