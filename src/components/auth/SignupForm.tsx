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
  googleProvider,
  facebookProvider,
  isEmailVerifiedOrTrustedProvider,
} from "./authProviders";
import { authErrorMessageFor, getAuthErrorCode } from "./authErrorMessages";
import { useOAuthSignIn } from "./useOAuthSignIn";
import { signupSchema, type SignupValues } from "./authSchemas";
import authCss from "./AuthLayout.module.css";
import fields from "../form/fields.module.css";
import buttons from "../form/buttons.module.css";
import css from "./SignupForm.module.css";

export function SignupForm() {
  const navigate = useNavigate();
  const { oauthBusy, error, setError, linking, setLinking, handleOAuth } =
    useOAuthSignIn({
      onUnverifiedOAuth: async (user) => {
        // Defensive: useOAuthSignIn already gates on
        // isEmailVerifiedOrTrustedProvider, so trusted-provider users never
        // reach this callback. Re-checking here keeps the email-send guard
        // local to the call - if the gate ever loosens, FB users still
        // don't get an unsolicited verification email.
        if (isEmailVerifiedOrTrustedProvider(user)) {
          return { sendFailed: false };
        }
        let sendFailed = false;
        try {
          await sendEmailVerification(user);
        } catch (sendErr) {
          sendFailed = true;
          logError(sendErr, { stage: "signupForm.oauth.sendEmailVerification" });
        }
        return { sendFailed };
      },
    });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "" },
  });

  function handleLinked(user: User) {
    navigate(
      isEmailVerifiedOrTrustedProvider(user) ? "/dashboard" : "/verify-email",
    );
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
      const code = getAuthErrorCode(err);
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
