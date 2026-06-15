import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { sendEmailVerification } from "firebase/auth";
import { auth } from "../../firebase";
import { logError } from "../../utils/logError";
import { AuthLayout } from "./AuthLayout";
import authCss from "./AuthLayout.module.css";
import buttons from "../form/buttons.module.css";
import css from "./EmailVerification.module.css";

interface VerifyState {
  sendFailed?: boolean;
}

export function EmailVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const initial = (location.state as VerifyState | null)?.sendFailed ?? false;
  const [sendFailed, setSendFailed] = useState(initial);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState("");
  const email = auth.currentUser?.email ?? null;

  async function handleResend() {
    setResendError("");
    if (!auth.currentUser) {
      setResendError(
        "You're not signed in. Return to sign in and try again.",
      );
      return;
    }
    setResending(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setSendFailed(false);
    } catch (err) {
      logError(err, { stage: "emailVerification.resend" });
      setSendFailed(true);
      setResendError("We had trouble sending the email. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout heading="Verify your email">
      <div className={css.panel}>
        <div className={authCss.confirmIcon} aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path
              d="M5,6.67 L35,6.67 C36.1,6.67 37,7.56 37,8.67 L37,27.75 L31.25,33.33 L5,33.33 C3.9,33.33 3,32.44 3,31.33 L3,8.67 C3,7.56 3.9,6.67 5,6.67 Z"
              fill="rgba(0,179,192,0.35)"
            />
            <path
              d="M18.5,33.33 L5,33.33 C3.9,33.33 3,32.44 3,31.33 L3,8.67 C3,7.56 3.9,6.67 5,6.67 L35,6.67 C36.1,6.67 37,7.56 37,8.67 L37,21"
              stroke="var(--subtext)"
              strokeWidth="2.5"
              fill="none"
            />
            <polyline
              points="37,8.5 20,20.5 3,8.5"
              stroke="var(--subtext)"
              strokeWidth="2.5"
              fill="none"
            />
            <polyline
              points="38.79,25.85 29.21,35.44 23.5,29.73"
              stroke="var(--subtext)"
              strokeWidth="2.75"
              fill="none"
            />
          </svg>
        </div>

        {sendFailed ? (
          <p className={authCss.authSubtext}>
            We had trouble sending the verification email
            {email ? <> to <strong className={css.recipientEmail}>{email}</strong></> : null}.
            Tap Resend to try again.
          </p>
        ) : (
          <p className={authCss.authSubtext}>
            We sent a verification link
            {email ? <> to <strong className={css.recipientEmail}>{email}</strong></> : null}
            . Click the link in the email to activate your account, then come
            back here to continue.
          </p>
        )}
        <p className={`${authCss.authSubtext} ${css.subtextTight}`}>
          If the verification email doesn&rsquo;t appear within a few minutes,
          check your spam folder.
        </p>

        <button
          type="button"
          className={buttons.ctaBtn}
          onClick={() => navigate("/dashboard")}
        >
          Continue
        </button>

        <button
          type="button"
          className={`${buttons.ctaBtn} ${buttons.ctaBtnSecondary}`}
          onClick={handleResend}
          disabled={resending}
        >
          {resending ? "Sending..." : "Resend Link"}
        </button>

        {resendError && (
          <p className={css.formError} role="alert">
            {resendError}
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
