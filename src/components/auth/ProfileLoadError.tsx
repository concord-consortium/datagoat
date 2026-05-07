import common from "../common.module.css";
import buttons from "../form/buttons.module.css";
import css from "./ProfileLoadError.module.css";
import type { ProfileLoadErrorKind } from "../../types/profile";

interface ProfileLoadErrorProps {
  onRetry: () => void;
  kind: ProfileLoadErrorKind;
}

// Rendered by ProtectedRoute / OnboardingRoute when the profile snapshot
// subscription errors or migration throws. Distinct from the 'missing' branch
// so a transient error or unmigrated doc can't drop a returning user into
// onboarding (where submitting the form would setDoc(merge:true) over their
// real profile). Copy is kind-specific because retry actually helps for
// subscription failures but a corrupt doc needs support escalation.
export function ProfileLoadError({ onRetry, kind }: ProfileLoadErrorProps) {
  const body =
    kind === "migration"
      ? "There's a problem with your saved profile data. If retrying doesn't help, please contact support."
      : "Check your connection and try again. Your data is safe.";
  return (
    <div className={common.centered} role="alert" aria-live="assertive">
      <p className={css.title}>Couldn&rsquo;t load your profile</p>
      <p className={css.body}>{body}</p>
      <button
        type="button"
        className={`${buttons.ctaBtnSecondary} ${css.retryBtn}`}
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}
