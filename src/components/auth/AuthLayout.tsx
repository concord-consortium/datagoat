import type { ReactNode } from "react";
import common from "../common.module.css";
import css from "./AuthLayout.module.css";

// Brand mark lives in public/icons/ so it's served directly at the root URL
// (Vite's public dir convention). The spec pins URL imports for brand SVGs;
// served from public/ keeps the brand colors locked + the bytes out of the
// JS bundle. Auth-screen first-paint flicker is minimised via the
// <link rel="preload" as="image" href="/icons/datagoat-logo-login.svg">
// already in index.html (Foundations step).
const datagoatLogoLogin = "/icons/datagoat-logo-login.svg";

interface AuthLayoutProps {
  heading: string;
  // The form-area slot. AuthLayout assigns id="main-content" + tabIndex={-1}
  // here so the skip link's anchor jump lands focus programmatically.
  children: ReactNode;
}

export function AuthLayout({ heading, children }: AuthLayoutProps) {
  return (
    <div className={css.shell}>
      <a className={common.skipLink} href="#main-content">
        Skip to main content
      </a>

      <div className={css.headerZone}>
        <div className={css.identityBar}>
          <div className={css.brandRow} aria-label="DataGOAT">
            <img
              className={css.brandLogoImg}
              src={datagoatLogoLogin}
              alt="DataGOAT logo"
            />
          </div>
        </div>

        <div className={css.wordmarkRow}>
          <div className={css.wordmark} aria-label="DataGOAT">
            <span className={css.data}>Data</span>
            <span className={css.goat}>
              <span className={css.goatG}>G</span>OA<span className={css.goatT}>T</span>
            </span>
          </div>
          <p className={css.tagline}>Empowering Student Athletes through Data</p>
        </div>
      </div>

      <div className={css.accentLine} aria-hidden="true" />

      <div
        className={css.contentBlock}
        id="main-content"
        tabIndex={-1}
      >
        <h2 className={css.authHeading}>{heading}</h2>
        <div className={css.formArea}>{children}</div>
      </div>
    </div>
  );
}
