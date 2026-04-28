import { useState, type FormEvent } from "react";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  linkWithCredential,
  type AuthCredential,
  type User,
} from "firebase/auth";
import { auth } from "../../firebase";
import { logError } from "../../utils/logError";
import { authErrorMessageFor } from "./authErrorMessages";
import { googleProvider } from "./authProviders";
import authCss from "./AuthLayout.module.css";
import fields from "../form/fields.module.css";
import buttons from "../form/buttons.module.css";
import socials from "./SocialButtons.module.css";
import css from "./LinkAccountPanel.module.css";

const googleLogo = "/icons/google-logo.svg";

interface LinkAccountPanelProps {
  email: string;
  pendingCredential: AuthCredential;
  existingMethods: string[];
  onLinked: (user: User) => void;
  onCancel: () => void;
}

function describeMethod(methods: string[]): string {
  if (methods.includes("google.com")) return "Google";
  if (methods.includes("password")) return "email";
  if (methods.length > 0) return methods[0];
  return "another sign-in method";
}

export function LinkAccountPanel({
  email,
  pendingCredential,
  existingMethods,
  onLinked,
  onCancel,
}: LinkAccountPanelProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const providerName = describeMethod(existingMethods);
  const showGoogle = existingMethods.includes("google.com");
  const showPassword = existingMethods.includes("password");

  async function attemptLink(signedInUser: User) {
    try {
      // Use the user from the just-resolved sign-in promise (NOT
      // auth.currentUser) so the linkage is scoped to the user that
      // authenticated for this flow.
      const linked = await linkWithCredential(signedInUser, pendingCredential);
      onLinked(linked.user);
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code?: unknown }).code)
          : "auth/internal-error";
      logError(err, { stage: "linkWithCredential", code });
      setError(authErrorMessageFor(code));
    }
  }

  async function handleGoogle() {
    setError("");
    setSubmitting(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await attemptLink(result.user);
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code?: unknown }).code)
          : "auth/internal-error";
      logError(err, { stage: "linkAccount.googlePopup", code });
      setError(authErrorMessageFor(code));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await attemptLink(cred.user);
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code?: unknown }).code)
          : "auth/internal-error";
      logError(err, { stage: "linkAccount.password", code });
      setError(authErrorMessageFor(code));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h3 className={css.panelHeading}>This email is already registered</h3>
      <p className={css.panelBody}>
        <strong>{email}</strong> is registered with{" "}
        <span className={css.providerLabel}>{providerName}</span>. Sign in to
        link Facebook to your account.
      </p>

      {showGoogle && (
        <div className={socials.socialButtons}>
          <button
            type="button"
            className={socials.socialBtn}
            onClick={handleGoogle}
            disabled={submitting}
          >
            <img src={googleLogo} alt="" />
            Continue with Google
          </button>
        </div>
      )}

      {showPassword && (
        <form onSubmit={handlePasswordSubmit} noValidate>
          <div className={fields.fieldWrap}>
            <label className={fields.fieldLabel} htmlFor="link-email">
              Email
            </label>
            <input
              id="link-email"
              type="email"
              className={fields.fieldInput}
              value={email}
              readOnly
              autoComplete="email"
            />
          </div>
          <div className={fields.fieldWrap}>
            <label className={fields.fieldLabel} htmlFor="link-password">
              Password<span className={fields.requiredMark} aria-hidden="true">*</span>
            </label>
            <input
              id="link-password"
              type="password"
              className={fields.fieldInput}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button
            type="submit"
            className={buttons.ctaBtn}
            disabled={submitting || password.length === 0}
          >
            Sign in to link
          </button>
        </form>
      )}

      {error && (
        <p
          className={fields.fieldErrorMsg}
          role="alert"
          style={{ marginTop: 16 }}
        >
          {error}
        </p>
      )}

      <p className={`${authCss.authAltLink} ${css.cancelRow}`}>
        <button
          type="button"
          className={authCss.authSwitchBtn}
          onClick={onCancel}
        >
          Cancel and return
        </button>
      </p>
    </div>
  );
}
