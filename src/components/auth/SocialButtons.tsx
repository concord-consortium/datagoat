import css from "./SocialButtons.module.css";

const googleLogo = "/icons/google-logo.svg";
const facebookLogo = "/icons/facebook-logo.svg";

interface SocialButtonsProps {
  mode: "signin" | "signup";
  onGoogle: () => void;
  onFacebook: () => void;
  disabled?: boolean;
}

export function SocialButtons({
  mode,
  onGoogle,
  onFacebook,
  disabled,
}: SocialButtonsProps) {
  const dividerLabel = mode === "signin" ? "or" : "or sign up with email";
  return (
    <>
      <div className={css.socialButtons}>
        <button
          type="button"
          className={css.socialBtn}
          onClick={onGoogle}
          disabled={disabled}
        >
          <img src={googleLogo} alt="" />
          Continue with Google
        </button>
        <button
          type="button"
          className={css.socialBtn}
          onClick={onFacebook}
          disabled={disabled}
        >
          <img src={facebookLogo} alt="" />
          Continue with Facebook
        </button>
      </div>
      <div className={css.authDivider} aria-hidden="true">
        {dividerLabel}
      </div>
    </>
  );
}
