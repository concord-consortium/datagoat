import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  type User,
} from "firebase/auth";
import { auth } from "../../firebase";
import { logError } from "../../utils/logError";
import { AuthLayout } from "./AuthLayout";
import { SocialButtons } from "./SocialButtons";
import { PasswordField } from "./PasswordField";
import { LinkAccountPanel } from "./LinkAccountPanel";
import {
  signInWithProvider,
  googleProvider,
  facebookProvider,
  type LinkingState,
} from "./authProviders";
import { authErrorMessageFor } from "./authErrorMessages";
import { signupSchema, type SignupValues } from "./authSchemas";
import authCss from "./AuthLayout.module.css";
import fields from "../form/fields.module.css";
import buttons from "../form/buttons.module.css";
import css from "./SignupForm.module.css";

export function SignupForm() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [linking, setLinking] = useState<LinkingState | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "" },
  });

  function handleLinked(_user: User) {
    navigate("/dashboard");
  }

  async function handleOAuth(
    provider: typeof googleProvider | typeof facebookProvider,
  ) {
    setError("");
    setOauthBusy(true);
    try {
      const result = await signInWithProvider(provider);
      if (result.ok) {
        if (!result.user.emailVerified) {
          // Same flow as email/password signup: send verification, route to
          // /verify-email. send failure is logged but doesn't abort.
          let sendFailed = false;
          try {
            await sendEmailVerification(result.user);
          } catch (sendErr) {
            sendFailed = true;
            logError(sendErr, { stage: "signupForm.oauth.sendEmailVerification" });
          }
          navigate("/verify-email", { state: { sendFailed } });
          return;
        }
        navigate("/dashboard");
        return;
      }
      if (result.kind === "account-collision") {
        setLinking({
          email: result.email,
          pendingCredential: result.pendingCredential,
          existingMethods: result.existingMethods,
        });
        return;
      }
      if (result.kind === "blocked-no-email") {
        setError(result.message);
        return;
      }
      setError(authErrorMessageFor(result.code));
    } finally {
      setOauthBusy(false);
    }
  }

  async function onSubmit(values: SignupValues) {
    setError("");
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password,
      );
      let sendFailed = false;
      try {
        await sendEmailVerification(cred.user);
      } catch (sendErr) {
        sendFailed = true;
        logError(sendErr, { stage: "signupForm.sendEmailVerification" });
      }
      navigate("/verify-email", { state: { sendFailed } });
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code?: unknown }).code)
          : "auth/internal-error";
      logError(err, { stage: "signupForm.create", code });
      setError(authErrorMessageFor(code));
    }
  }

  if (linking) {
    return (
      <AuthLayout heading="Link your account">
        <LinkAccountPanel
          email={linking.email}
          pendingCredential={linking.pendingCredential}
          existingMethods={linking.existingMethods}
          onLinked={handleLinked}
          onCancel={() => setLinking(null)}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout heading="Create your account">
      <div className={css.panel}>
        <SocialButtons
          mode="signup"
          onGoogle={() => handleOAuth(googleProvider)}
          onFacebook={() => handleOAuth(facebookProvider)}
          disabled={oauthBusy || isSubmitting}
        />

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className={fields.fieldWrap}>
            <label className={fields.fieldLabel} htmlFor="signup-email">
              Email
              <span className={fields.requiredMark} aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              className={`${fields.fieldInput}${errors.email ? ` ${fields.fieldError}` : ""}`}
              placeholder="you@school.edu"
              aria-required="true"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "signup-email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p
                id="signup-email-error"
                className={fields.fieldErrorMsg}
                role="alert"
              >
                {errors.email.message}
              </p>
            )}
          </div>

          <PasswordField
            id="signup-password"
            label="Password"
            required
            autoComplete="new-password"
            placeholder="Create a password"
            error={errors.password?.message}
            {...register("password")}
          />

          <button
            type="submit"
            className={buttons.ctaBtn}
            disabled={isSubmitting || oauthBusy}
          >
            Create Account
          </button>
        </form>

        {error && (
          <p className={css.formError} role="alert">
            {error}
          </p>
        )}

        <p className={authCss.authAltLink}>
          Already have an account?{" "}
          <button
            type="button"
            className={authCss.authSwitchBtn}
            onClick={() => navigate("/login")}
          >
            Log in
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}
