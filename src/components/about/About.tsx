import { APP_VERSION, APP_VERSION_DESC } from "../../App";
import css from "./About.module.css";

// About screen. Renders the prototype's static "About DataGOAT" copy
// (NSF disclaimer + Credits + university logos at HTML lines 3986-3997)
// plus a muted version footer line. Per requirements "Version display"
// decision: the App.tsx sticky-bottom footer was removed at conversion
// time, and version info migrates here so PWA debugging stays viable.
export function About() {
  // import.meta.env.VITE_BUILD_TIME is injected via the Vite `define`
  // config (see vite.config.ts) and captured once when Vite starts -
  // build invocation time for `vite build`, dev-server startup time
  // for `vite dev` (frozen across reloads until the server restarts).
  const buildTime = import.meta.env.VITE_BUILD_TIME ?? "(dev build)";

  return (
    <div className={css.aboutScreen}>
      <p className={css.bodyPara}>
        <img
          src="/icons/about-nsf-logo.svg"
          width={40}
          height={40}
          alt="NSF logo"
          className={css.nsfLogo}
        />
        This material is based upon work supported by the National Science
        Foundation under Grant No. DRL-2411706. Any opinions, findings,
        and conclusions or recommendations expressed in this material are
        those of the author(s) and do not necessarily reflect the views
        of the National Science Foundation.
      </p>
      <p className={css.bodyPara}>
        <strong className={css.creditsLabel}>Credits</strong>
        <br />
        University of Maryland · University of North Carolina · Concord
        Consortium
      </p>

      <div className={css.logoRow}>
        <img
          src="/icons/about-umd-logo.svg"
          width={40}
          height={40}
          alt="University of Maryland logo"
        />
        <img
          src="/icons/about-unc-logo.svg"
          width={45}
          height={36}
          alt="University of North Carolina logo"
        />
        <img
          src="/icons/about-cc-logo.svg"
          width={36}
          height={40}
          alt="Concord Consortium logo"
        />
      </div>

      <p className={css.versionFooter}>
        {APP_VERSION} - {APP_VERSION_DESC}
        <br />
        Build: {buildTime}
      </p>
    </div>
  );
}
