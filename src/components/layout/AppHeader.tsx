import css from "./AppHeader.module.css";

// Small 43x36 dashboard mark for the in-app screen-header chrome. The
// large hero logo (datagoat-logo-login.svg) is reserved for AuthLayout.
const datagoatLogo = "/icons/datagoat-logo-dashboard.svg";
const speedLines = "/icons/speed-lines.svg";

// AppHeader is the brand chrome rendered at the top of every authed
// route except /dashboard (which renders DashboardHeaderSlide instead).
// Matches the prototype's `.screen-header` (HTML 940-961) + the
// `brand-logo-img` injected by the prototype JS (line 5043-5052):
//   - speed-lines decoration in the header zone
//   - brand logo (small DataGOAT goat icon) on the left
//   - wordmark + tagline filling the row
//   - animated accent line below
//
// The hamburger menu trigger is INTENTIONALLY NOT here - it lives in
// each route's <SectionHeading> per the prototype's HTML structure
// (the page-title row at HTML line 4273 carries the hamburger).
export function AppHeader() {
  return (
    <div className={css.shell}>
      <div className={css.headerZone}>
        <img
          className={css.speedLines}
          src={speedLines}
          alt=""
          aria-hidden="true"
        />
        <img
          className={css.brandLogoImg}
          src={datagoatLogo}
          alt="DataGOAT logo"
        />
        <div className={css.wordmark} aria-label="DataGOAT">
          <span className={css.data}>Data</span>
          <span className={css.goat}>
            <span className={css.goatG}>G</span>OA<span className={css.goatT}>T</span>
          </span>
        </div>
        <p className={css.tagline}>Empowering Student Athletes through Data</p>
      </div>
      <div className={css.accentLine} aria-hidden="true" />
    </div>
  );
}
