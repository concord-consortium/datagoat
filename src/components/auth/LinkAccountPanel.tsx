import { useState, type FormEvent } from "react";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
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
  onLinked: (user: User) => void;
  onCancel: () => void;
}

export function LinkAccountPanel({
  email,
  pendingCredential,
  onLinked,
  onCancel,
}: LinkAccountPanelProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function attemptLink(signedInUser: User) {
    // Defense in depth: only link if the just-signed-in account actually
    // owns the email Facebook returned. Without this, a user who satisfies
    // the prompt with an unrelated existing account could attach the
    // pending Facebook credential to that account, turning Facebook into
    // a valid sign-in path for an account that never opted into it.
    const signedInEmail = signedInUser.email?.toLowerCase() ?? "";
    if (signedInEmail !== email.toLowerCase()) {
      logError(new Error("link email mismatch"), {
        stage: "linkWithCredential.emailMismatch",
        signedInEmail,
        expectedEmail: email,
      });
      // The user is now signed in as the wrong account; sign them back out
      // before showing the error so we don't leave a dangling session for
      // an account they didn't actually intend to enter.
      try {
        await signOut(auth);
      } catch (signOutErr) {
        logError(signOutErr, { stage: "linkWithCredential.signOutAfterMismatch" });
      }
      setError(
        `That account doesn't match ${email}. Sign in with the account that owns ${email} to link Facebook.`,
      );
      return;
    }
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
      // Sign-in succeeded but linking did not, so the user is authed as
      // the existing account. Drop that session before surfacing the
      // error so RedirectIfAuthed doesn't whisk them off /login on the
      // next nav while the panel still claims linking failed.
      try {
        await signOut(auth);
      } catch (signOutErr) {
        logError(signOutErr, { stage: "linkWithCredential.signOutAfterLinkFailure" });
      }
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
      <h2 className={css.panelHeading}>This email is already registered</h2>
      <p className={css.panelBody}>
        <strong>{email}</strong> is already registered with DataGOAT. Sign in
        with the method you used originally to link Facebook to your account.
      </p>

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
              aria-required="true"
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
