import type { ReactNode } from "react";

interface IfProps {
  condition: boolean;
  children: ReactNode;
}

// Conditional rendering as JSX rather than `&&` expressions, so component
// bodies stay JSX-all-the-way-down instead of jumping between JSX and
// boolean expressions.
//
// Note: children are still constructed even when condition is false (just
// not rendered). For conditions that exist to narrow a possibly-undefined
// value, use a non-null assertion on the value passed to children — the
// runtime guard inside `<If>` enforces the assertion.
//
// Usage:
//   <If condition={someBoolean}>
//     <Component />
//   </If>
export function If({ condition, children }: IfProps) {
  return condition ? <>{children}</> : null;
}
