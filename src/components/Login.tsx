import { useState } from "react";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  updateProfile,
} from "firebase/auth";
import { auth } from "../firebase";
import common from "./common.module.css";
import css from "./Login.module.css";

const googleProvider = new GoogleAuthProvider();

const authErrorMessages: Record<string, string> = {
  "auth/user-not-found": "Invalid email or password",
  "auth/wrong-password": "Invalid email or password",
  "auth/invalid-credential": "Invalid email or password",
  "auth/email-already-in-use": "An account with this email already exists",
  "auth/weak-password": "Password must be at least 6 characters",
  "auth/invalid-email": "Please enter a valid email address",
  "auth/too-many-requests": "Too many attempts. Please try again later",
  "auth/network-request-failed": "Network error. Check your connection",
  "auth/popup-closed-by-user": "Sign-in cancelled",
  "auth/popup-blocked": "Pop-up was blocked. Please allow pop-ups for this site",
};

function getAuthErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code;
  if (code && code in authErrorMessages) {
    return authErrorMessages[code];
  }
  return "Something went wrong. Please try again";
}

interface LoginProps {
  onRegistered?: (displayName: string) => void;
}

export function Login({ onRegistered }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    try {
      if (isRegistering) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) {
          await updateProfile(cred.user, { displayName });
          onRegistered?.(displayName);
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err));
    }
  };

  const handleGoogle = async () => {
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err));
    }
  };

  return (
    <div className={common.centered}>
      <h1 className={common.title}>DataGOAT</h1>

      <div className={css.form}>
        <button onClick={handleGoogle} className={css.button}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Sign in with Google
        </button>

        <hr className={css.divider} />

        <form onSubmit={handleEmailAuth} className={css.emailForm}>
          {isRegistering && (
            <div className={css.field}>
              <label htmlFor="displayName" className={css.label}>Display name</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={css.input}
              />
            </div>
          )}
          <div className={css.field}>
            <label htmlFor="email" className={css.label}>Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={css.input}
            />
          </div>
          <div className={css.field}>
            <label htmlFor="password" className={css.label}>Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className={css.input}
            />
          </div>
          <button type="submit" className={css.button}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            {isRegistering ? "Create account" : "Sign in with email"}
          </button>
        </form>

        <button
          onClick={() => { setIsRegistering(!isRegistering); setError(""); }}
          className={css.button}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          {isRegistering ? "Already have an account? Sign in" : "Need an account? Register"}
        </button>

        {error && <p className={css.error}>{error}</p>}
      </div>
    </div>
  );
}
