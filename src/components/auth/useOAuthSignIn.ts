import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AuthProvider, User } from "firebase/auth";
import { signInWithProvider, type LinkingState } from "./authProviders";
import { authErrorMessageFor } from "./authErrorMessages";

export interface UseOAuthSignInOptions {
  // Called after a successful OAuth sign-in where the returned user has
  // emailVerified=false. Whatever it returns is forwarded as router state on
  // the /verify-email navigation; SignupForm uses this to send a verification
  // email and report sendFailed, while LoginForm omits the callback.
  onUnverifiedOAuth?: (user: User) => Promise<unknown> | unknown;
}

export function useOAuthSignIn(options: UseOAuthSignInOptions = {}) {
  const { onUnverifiedOAuth } = options;
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [linking, setLinking] = useState<LinkingState | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);

  async function handleOAuth(provider: AuthProvider) {
    setError("");
    setOauthBusy(true);
    try {
      const result = await signInWithProvider(provider);
      if (result.ok) {
        if (!result.user.emailVerified) {
          const navState = onUnverifiedOAuth
            ? await onUnverifiedOAuth(result.user)
            : undefined;
          if (navState !== undefined) {
            navigate("/verify-email", { state: navState });
          } else {
            navigate("/verify-email");
          }
          return;
        }
        navigate("/dashboard");
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

  return { oauthBusy, error, setError, linking, setLinking, handleOAuth };
}
