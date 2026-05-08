import type { ReactNode } from "react";

interface IfProps {
  condition: boolean;
  children: ReactNode;
}

// Conditional rendering as JSX rather than `&&` expressions, so component
// bodies stay JSX-all-the-way-down instead of jumping between JSX and
// boolean expressions.
//
// Important caveat: `<If>` only skips RENDERING the children — the child
// JSX expression itself is always evaluated. Passing a possibly-undefined
// value as a prop is safe (the child component never executes when
// condition is false), but DEREFERENCING a possibly-undefined value
// inside the child expression — e.g. `<C foo={x!.bar}>` — runs at element
// construction time and will throw regardless of `condition`. For those
// cases narrow the value before the child expression, or fall back to a
// regular `&&` short-circuit.
//
// Usage:
//   <If condition={someBoolean}>
//     <Component />
//   </If>
export function If({ condition, children }: IfProps) {
  return condition ? <>{children}</> : null;
}
