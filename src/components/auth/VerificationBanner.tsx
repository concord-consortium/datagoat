import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import css from "./VerificationBanner.module.css";

const DAYS_THRESHOLD = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

function dismissedKey(uid: string): string {
  return `verifyBannerDismissed:${uid}`;
}

export function VerificationBanner() {
  const { user, isEmailVerifiedOrTrusted } = useAuth();
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

  // Force a re-render hourly and on visibilitychange so a long-running PWA
  // crosses the 7-day threshold mid-session. Firebase reuses the User
  // reference across token refreshes, so AuthContext alone never re-renders us.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!user || isEmailVerifiedOrTrusted) return;
    const bump = () => forceTick((t) => t + 1);
    const intervalId = window.setInterval(bump, REFRESH_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, isEmailVerifiedOrTrusted]);

  let daysUnverified = 0;
  if (user?.metadata?.creationTime) {
    const created = new Date(user.metadata.creationTime).getTime();
    daysUnverified = Math.floor((Date.now() - created) / MS_PER_DAY);
  }

  if (!user) return null;
  if (isEmailVerifiedOrTrusted) return null;
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
