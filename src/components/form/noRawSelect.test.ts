import { describe, it, expect } from "vitest";

// Guardrail for the "Form controls" convention in CLAUDE.md.
//
// SelectField (this directory) covers every dropdown case, so there is no
// legitimate bare <select> elsewhere in the app. A hand-rolled <select>
// silently skips the shared label association, aria wiring, and dark-theme
// styling from fields.module.css and renders unstyled against the dark
// background - the exact defect the custom-metric Time row shipped with
// (DGT-19). This test fails CI if a raw <select> reappears outside the form
// primitives, catching the regression that CLAUDE.md guidance alone can't
// guarantee an author (human or agent) will respect.
//
// <input> is intentionally NOT linted here: radio/checkbox/color and the
// styled raw-input patterns (auth RHF fields, NumericInput/TimeInput, the
// levels-editor tag-selector styling) are all legitimate, so an <input>
// scan would be noisy. See CLAUDE.md "Form controls" for that half of the
// rule, which is enforced by review rather than a test.

// Vite reads every component source as a raw string at collect time. The
// glob is rooted at the project (a leading "/" is the Vite project root),
// so keys are stable "/src/..." paths regardless of this file's location -
// which lets the /components/form/ exclusion below match reliably.
const sources = import.meta.glob("/src/**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// Drop // line comments and /* */ block comments (the latter also covers
// JSX {/* */}) so a prose mention of `<select>` in a comment - e.g. the
// "the <select> understands" note in CustomMetricForm - isn't flagged as a
// real element.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

describe("no raw <select> outside the form primitives", () => {
  it("has zero bare <select> elements in app source", () => {
    const offenders = Object.entries(sources)
      .filter(
        ([path]) =>
          !path.includes("/components/form/") && !path.includes(".test."),
      )
      // [\s>] matches the opening tag in every real form: `<select `,
      // `<select>`, or `<select` at a line break before its props.
      .filter(([, src]) => /<select[\s>]/.test(stripComments(src)))
      .map(([path]) => path);

    expect(
      offenders,
      `Use <SelectField> instead of a raw <select>. Offending files:\n${offenders.join(
        "\n",
      )}`,
    ).toEqual([]);
  });
});
