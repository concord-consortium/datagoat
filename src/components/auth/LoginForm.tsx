import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, type User } from "firebase/auth";
import { auth } from "../../firebase";
import { logError } from "../../utils/logError";
import { AuthLayout } from "./AuthLayout";
import { SocialButtons } from "./SocialButtons";
import { PasswordField } from "./PasswordField";
import { LinkAccountPanel } from "./LinkAccountPanel";
import { googleProvider, facebookProvider } from "./authProviders";
import { authErrorMessageFor, getAuthErrorCode } from "./authErrorMessages";
import { useOAuthSignIn } from "./useOAuthSignIn";
import { loginSchema, type LoginValues } from "./authSchemas";
import authCss from "./AuthLayout.module.css";
import fields from "../form/fields.module.css";
import buttons from "../form/buttons.module.css";
import css from "./LoginForm.module.css";

export function LoginForm() {
  const navigate = useNavigate();
  const { oauthBusy, error, setError, linking, setLinking, handleOAuth } =
    useOAuthSignIn();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function handleLinked(user: User) {
    navigate(user.emailVerified ? "/dashboard" : "/verify-email");
  }

  async function onSubmit(values: LoginValues) {
    setError("");
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
      navigate("/dashboard");
    } catch (err: unknown) {
      const code = getAuthErrorCode(err);
      logError(err, { stage: "loginForm.emailPassword", code });
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
    <AuthLayout heading="Welcome back">
      <div className={css.panel}>
        <SocialButtons
          mode="signin"
          onGoogle={() => handleOAuth(googleProvider)}
          onFacebook={() => handleOAuth(facebookProvider)}
          disabled={oauthBusy || isSubmitting}
        />

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className={fields.fieldWrap}>
            <label className={fields.fieldLabel} htmlFor="login-email">
              Email
              <span className={fields.requiredMark} aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              className={`${fields.fieldInput}${errors.email ? ` ${fields.fieldError}` : ""}`}
              placeholder="you@school.edu"
              aria-required="true"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "login-email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p
                id="login-email-error"
                className={fields.fieldErrorMsg}
                role="alert"
              >
                {errors.email.message}
              </p>
            )}
          </div>

          <PasswordField
            id="login-password"
            label="Password"
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            forgotLinkTo="/forgot-password"
            error={errors.password?.message}
            {...register("password")}
          />

          <button
            type="submit"
            className={buttons.ctaBtn}
            disabled={isSubmitting || oauthBusy}
          >
            Log In
          </button>
        </form>

        {error && (
          <p className={css.formError} role="alert">
            {error}
          </p>
        )}

        <p className={authCss.authAltLink}>
          Don&rsquo;t have an account?{" "}
          <button
            type="button"
            className={authCss.authSwitchBtn}
            onClick={() => navigate("/signup")}
          >
            Sign up
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}
