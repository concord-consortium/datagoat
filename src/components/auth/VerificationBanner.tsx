import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import css from "./VerificationBanner.module.css";

const DAYS_THRESHOLD = 7;

function dismissedKey(uid: string): string {
  return `verifyBannerDismissed:${uid}`;
}

export function VerificationBanner() {
  const { user, isEmailVerified, daysUnverified } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (!user) return false;
    // localStorage can throw in Safari Private Browsing and locked-down
    // browser policies. Treat any failure as "not dismissed" rather than
    // letting the throw escape and crash the authed route surface.
    try {
      return localStorage.getItem(dismissedKey(user.uid)) === "1";
    } catch {
      return false;
    }
  });

  if (!user) return null;
  if (isEmailVerified) return null;
  if (daysUnverified < DAYS_THRESHOLD) return null;
  if (dismissed) return null;

  function handleDismiss() {
    if (!user) return;
    try {
      localStorage.setItem(dismissedKey(user.uid), "1");
    } catch {
      // Persisting the dismissal failed (private mode, quota, policy).
      // Still hide the banner for the rest of this session.
    }
    setDismissed(true);
  }

  return (
    <div className={css.banner} role="status">
      <p className={css.body}>
        <span className={css.bodyEmphasis}>Verify your email</span> to keep your
        DataGOAT account secure.{" "}
        <button
          type="button"
          className={css.action}
          onClick={() => navigate("/verify-email")}
        >
          Resend the link
        </button>
        .
      </p>
      <button
        type="button"
        className={css.dismiss}
        aria-label="Dismiss verification reminder"
        onClick={handleDismiss}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
