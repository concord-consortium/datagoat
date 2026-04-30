import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "../firebase";
import { logError } from "../utils/logError";
import { SocialButtons } from "../components/auth/SocialButtons";
import { PasswordField } from "../components/auth/PasswordField";
import { LinkAccountPanel } from "../components/auth/LinkAccountPanel";
import {
  signInWithProvider,
  googleProvider,
  facebookProvider,
  type LinkingState,
} from "../components/auth/authProviders";
import { authErrorMessageFor } from "../components/auth/authErrorMessages";
import { loginSchema, type LoginValues } from "../components/auth/authSchemas";
import fields from "../components/form/fields.module.css";
import buttons from "../components/form/buttons.module.css";
import css from "./CodapPlugin.module.css";

// In-plugin sign-in panel. Mirrors LoginForm's three sign-in methods
// (Google + Facebook + email/password) but renders inside the plugin
// shell - no AuthLayout chrome and no router navigation. Successful
// sign-in flips the parent CodapPlugin to the authed branch via the
// AuthContext subscription.
//
// Sign up / Forgot password open the main DataGOAT app in a new tab
// rather than navigating in-plugin: onboarding and password reset live
// in the main app routing tree, and pulling them into the plugin would
// duplicate flows that already work fine top-level.
//
// Email-verification gate: if a sign-in returns a user with
// emailVerified=false, we sign back out and show a notice pointing to
// the main app. Same trust boundary as LoginForm's /verify-email
// redirect, just enforced by sign-out instead of routing.
export function CodapPluginSignIn() {
  const [error, setError] = useState("");
  const [linking, setLinking] = useState<LinkingState | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function externalLink(path: string): string {
    return `${window.location.origin}${path}`;
  }

  async function gateOnVerified(user: User): Promise<void> {
    if (user.emailVerified) return;
    await signOut(auth);
    setNeedsVerify(true);
  }

  async function handleOAuth(
    provider: typeof googleProvider | typeof facebookProvider,
  ) {
    setError("");
    setNeedsVerify(false);
    setOauthBusy(true);
    try {
      const result = await signInWithProvider(provider);
      if (result.ok) {
        await gateOnVerified(result.user);
        return;
      }
      if (result.kind === "account-collision") {
        setLinking({
          email: result.email,
          pendingCredential: result.pendingCredential,
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

  async function onSubmit(values: LoginValues) {
    setError("");
    setNeedsVerify(false);
    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        values.email,
        values.password,
      );
      await gateOnVerified(cred.user);
    } catch (err: unknown) {
      const rawCode =
        typeof err === "object" && err !== null && "code" in err
          ? (err as { code?: unknown }).code
          : undefined;
      const code =
        typeof rawCode === "string" && rawCode ? rawCode : "auth/internal-error";
      logError(err, { stage: "codapSignIn.emailPassword", code });
      setError(authErrorMessageFor(code));
    }
  }

  if (linking) {
    return (
      <div className={css.pluginShell}>
        <h1 className={css.heading}>DataGOAT in CODAP</h1>
        <LinkAccountPanel
          email={linking.email}
          pendingCredential={linking.pendingCredential}
          onLinked={() => setLinking(null)}
          onCancel={() => setLinking(null)}
        />
      </div>
    );
  }

  return (
    <div className={css.pluginShell}>
      <h1 className={css.heading}>DataGOAT in CODAP</h1>
      <p className={css.statusText}>Sign in to send your data to CODAP.</p>

      {needsVerify && (
        <p className={css.signInNotice} role="status">
          Please verify your email at{" "}
          <a
            href={externalLink("/verify-email")}
            target="_blank"
            rel="noopener noreferrer"
          >
            datagoat.concord.org
          </a>
          , then return here.
        </p>
      )}

      <SocialButtons
        mode="signin"
        onGoogle={() => void handleOAuth(googleProvider)}
        onFacebook={() => void handleOAuth(facebookProvider)}
        disabled={oauthBusy || isSubmitting}
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className={fields.fieldWrap}>
          <label className={fields.fieldLabel} htmlFor="codap-login-email">
            Email
            <span className={fields.requiredMark} aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="codap-login-email"
            type="email"
            autoComplete="email"
            className={`${fields.fieldInput}${errors.email ? ` ${fields.fieldError}` : ""}`}
            placeholder="you@school.edu"
            aria-required="true"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={
              errors.email ? "codap-login-email-error" : undefined
            }
            {...register("email")}
          />
          {errors.email && (
            <p
              id="codap-login-email-error"
              className={fields.fieldErrorMsg}
              role="alert"
            >
              {errors.email.message}
            </p>
          )}
        </div>

        <PasswordField
          id="codap-login-password"
          label="Password"
          required
          autoComplete="current-password"
          placeholder="Enter your password"
          onForgotClick={() => {
            window.open(
              externalLink("/forgot-password"),
              "_blank",
              "noopener,noreferrer",
            );
          }}
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
        <p className={css.signInError} role="alert">
          {error}
        </p>
      )}

      <p className={css.signInAltLink}>
        Don&rsquo;t have an account?{" "}
        <a
          className={css.signInAltLinkAnchor}
          href={externalLink("/signup")}
          target="_blank"
          rel="noopener noreferrer"
        >
          Sign up
        </a>
      </p>
    </div>
  );
}
