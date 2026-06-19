// Shared "Skip to main content" focus-advance behavior.
//
// A skip link must NOT land focus on <main> itself: <main> carries
// tabIndex={-1} so it's programmatically focusable, but focusing it draws a
// focus ring around the entire scroll container - the "whole page is
// focused" noise DGT-47 removed from the Tab order. Instead, advance focus
// to the first real content control inside <main>, skipping chrome buttons
// tagged with data-skip-link-exclude (e.g. SectionHeading nav buttons) and
// disabled form controls (calling .focus() on a disabled element silently
// no-ops, which would strand focus on the skip link). Fall back to <main>
// itself only when it has no focusable content (pure-text screens).

// Internal to this module: the selector below is the only consumer.
// Components that mark chrome to skip apply the `data-skip-link-exclude`
// literal directly in their JSX (a literal attribute reads cleaner in
// markup than a computed key), so this constant intentionally isn't
// exported.
const SKIP_LINK_EXCLUDED_ATTR = "data-skip-link-exclude";

// Match on `data-skip-link-exclude` rather than CSS Module class names -
// CSS Modules hash class names ("_navMenuBtn_a5cf63"), so the raw
// kebab-case selectors that worked in the prototype's vanilla JS would
// never match here. The data attribute is stable across modules.
const SKIP_LINK_TARGET_SELECTOR = [
  `a[href]:not([${SKIP_LINK_EXCLUDED_ATTR}])`,
  `button:not([${SKIP_LINK_EXCLUDED_ATTR}]):not([disabled])`,
  `input:not([${SKIP_LINK_EXCLUDED_ATTR}]):not([disabled])`,
  `select:not([${SKIP_LINK_EXCLUDED_ATTR}]):not([disabled])`,
  `textarea:not([${SKIP_LINK_EXCLUDED_ATTR}]):not([disabled])`,
  `[tabindex]:not([tabindex="-1"]):not([${SKIP_LINK_EXCLUDED_ATTR}])`,
].join(", ");

export function focusFirstContentControl(main: HTMLElement | null) {
  if (!main) return;
  const first = main.querySelector<HTMLElement>(SKIP_LINK_TARGET_SELECTOR);
  (first ?? main).focus();
}
