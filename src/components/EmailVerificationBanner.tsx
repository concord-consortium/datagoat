import { useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "../contexts/AuthContext";

export function EmailVerificationBanner() {
  const { user, isEmailVerified, daysUnverified } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [resent, setResent] = useState(false);

  if (!user || isEmailVerified || dismissed || daysUnverified < 7) return null;

  async function handleResend() {
    if (!user) return;
    await sendEmailVerification(user);
    setResent(true);
  }

  return (
    <div className="alert alert-warning text-base" role="alert">
      <span>
        {resent
          ? "Verification email resent. Check your inbox."
          : "Please verify your email address."}
      </span>
      <div className="flex gap-2">
        {!resent && (
          <button className="btn btn-sm btn-ghost" onClick={handleResend}>
            Resend
          </button>
        )}
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
