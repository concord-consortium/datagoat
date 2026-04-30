import common from "../common.module.css";
import buttons from "../form/buttons.module.css";
import css from "./ProfileLoadError.module.css";

interface ProfileLoadErrorProps {
  onRetry: () => void;
}

// Rendered by ProtectedRoute / OnboardingRoute when the profile snapshot
// subscription errors. Distinct from the 'missing' branch so a transient
// Firestore error can't drop a returning user into onboarding (where
// submitting the form would setDoc(merge:true) over their real profile).
export function ProfileLoadError({ onRetry }: ProfileLoadErrorProps) {
  return (
    <div className={common.centered} role="alert" aria-live="assertive">
      <p className={css.title}>Couldn&rsquo;t load your profile</p>
      <p className={css.body}>
        Check your connection and try again. Your data is safe.
      </p>
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
