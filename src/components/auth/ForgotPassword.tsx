import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../firebase";
import { logError } from "../../utils/logError";
import { AuthLayout } from "./AuthLayout";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "./authSchemas";
import authCss from "./AuthLayout.module.css";
import fields from "../form/fields.module.css";
import buttons from "../form/buttons.module.css";

export function ForgotPassword() {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [actionableError, setActionableError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
    getValues,
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
    mode: "onChange",
  });

  // Bucket auth/user-not-found, auth/too-many-requests, and unknown errors
  // into the generic confirm so we never leak whether an account exists.
  // Firebase applies per-account rate-limiting on resets, so surfacing
  // auth/too-many-requests would create an account-existence oracle (it
  // fires only when the email maps to a real account). The confirm copy
  // includes a passive rate-limit hint so a legitimately throttled user
  // has a non-leaking explanation. Only auth/network-request-failed is
  // surfaced inline, since it is account-state-independent.
  async function attemptSend(email: string): Promise<{ shouldConfirm: boolean }> {
    setActionableError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      return { shouldConfirm: true };
    } catch (err: unknown) {
      logError(err, { stage: "forgotPassword.send" });
      const code = (err as { code?: string })?.code;
      if (code === "auth/network-request-failed") {
        setActionableError(
          "Couldn't reach the server. Check your connection and try again."
        );
        return { shouldConfirm: false };
      }
      return { shouldConfirm: true };
    }
  }

  async function onSubmit(values: ForgotPasswordValues) {
    const { shouldConfirm } = await attemptSend(values.email);
    if (shouldConfirm) setSubmitted(true);
  }

  async function handleResend() {
    const email = getValues("email");
    if (email) await attemptSend(email);
  }

  if (submitted) {
    return (
      <AuthLayout heading="Check your email">
        <div>
          <div className={authCss.confirmIcon} aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect
                x="3"
                y="6.67"
                width="34"
                height="26.67"
                rx="2"
                fill="rgba(0,179,192,0.35)"
              />
              <polyline
                points="37,8.5 20,20.5 3,8.5"
                stroke="var(--subtext)"
                strokeWidth="2.5"
                fill="none"
              />
            </svg>
          </div>
          <p className={authCss.authSubtext}>
            If an account exists for that email, we sent a reset link. Check
            your inbox. If it doesn&rsquo;t appear within a few minutes, check
            your spam folder. If you&rsquo;ve requested several resets
            recently, please wait a bit before trying again.
          </p>

          <button
            type="button"
            className={`${buttons.ctaBtn} ${buttons.ctaBtnSecondary}`}
            onClick={handleResend}
          >
            Resend Link
          </button>
          {actionableError && (
            <p className={fields.fieldErrorMsg} role="alert">
              {actionableError}
            </p>
          )}

          <p className={authCss.authAltLink}>
            <button
              type="button"
              className={authCss.authSwitchBtn}
              onClick={() => navigate("/login")}
            >
              Return to log in
            </button>
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout heading="Reset your password">
      <div>
        <p className={authCss.authSubtext}>
          Enter the email associated with your account and we&rsquo;ll send you
          a password reset link.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className={fields.fieldWrap}>
            <label className={fields.fieldLabel} htmlFor="forgot-email">
              Email
              <span className={fields.requiredMark} aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              className={clsx(fields.fieldInput, errors.email && fields.fieldError)}
              placeholder="you@school.edu"
              aria-required="true"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "forgot-email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p
                id="forgot-email-error"
                className={fields.fieldErrorMsg}
                role="alert"
              >
                {errors.email.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            className={buttons.ctaBtn}
            disabled={isSubmitting || !isValid}
          >
            Send Reset Link
          </button>
          {actionableError && (
            <p className={fields.fieldErrorMsg} role="alert">
              {actionableError}
            </p>
          )}
        </form>

        <p className={authCss.authAltLink}>
          <button
            type="button"
            className={authCss.authSwitchBtn}
            onClick={() => navigate("/login")}
          >
            Return to log in
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}
