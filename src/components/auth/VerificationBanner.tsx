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
    return localStorage.getItem(dismissedKey(user.uid)) === "1";
  });

  if (!user) return null;
  if (isEmailVerified) return null;
  if (daysUnverified < DAYS_THRESHOLD) return null;
  if (dismissed) return null;

  function handleDismiss() {
    if (!user) return;
    localStorage.setItem(dismissedKey(user.uid), "1");
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
