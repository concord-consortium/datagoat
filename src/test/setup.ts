import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// React's validateDOMNesting predates the Customizable Select API and
// flags <svg> as an invalid child of <option>. SelectField renders metric
// glyphs inside <option> on purpose -- appearance: base-select makes that
// markup valid and clones it into the closed-state trigger. The app is a
// client-only SPA (no hydration), so the warning is pure noise. Filter
// ONLY this exact <option>/<svg> nesting warning; every other
// console.error still surfaces so real regressions aren't masked.
//
// React passes the tag names as %s substitution args (with or without
// angle brackets depending on version), so the whole arg list is joined
// and matched on the stable validateDOMNesting phrasing plus both tags.
const realConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = args.map(String).join(" ");
  const isOptionNestingWarning =
    (msg.includes("cannot contain a nested") ||
      msg.includes("cannot be a child of")) &&
    msg.includes("option") &&
    msg.includes("svg");
  if (isOptionNestingWarning) return;
  // Call with `console` as the receiver -- some console.error
  // implementations rely on `this` being the console object.
  realConsoleError.call(console, ...args);
};

// vitest.config has globals: false, which disables RTL's auto-cleanup hook
// so we run cleanup manually here. Without this, dialogs and other rendered
// trees from prior tests stay in the DOM and trip up the next test's queries.
afterEach(() => {
  cleanup();
});

// jsdom's matchMedia is missing addEventListener / removeEventListener; the
// dashboard carousel + reduced-motion guards subscribe to mq.change events,
// so the polyfill matters even though no test file in this session needs it.
// Lives here so component tests in later steps just work.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

afterEach(() => {
  if (typeof localStorage !== "undefined") localStorage.clear();
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
});
